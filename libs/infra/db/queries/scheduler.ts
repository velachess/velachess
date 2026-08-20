import type { CardState } from "@velachess/scheduler";
import { and, asc, count, eq, isNull, lte, notExists, or } from "drizzle-orm";

import type { Database } from "../client.ts";
import type { Card, DrillOriginKind } from "../schema.ts";
import { cards, exerciseSources, exercises } from "../schema.ts";
import { drillScopeCondition, type DrillScope } from "./drill.ts";

function toCardState(row: Card): CardState {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    learningSteps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    phase: row.phase,
    lastReview: row.lastReview,
  };
}

function toRow(exerciseId: string, state: CardState) {
  return {
    exerciseId,
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsedDays: state.elapsedDays,
    scheduledDays: state.scheduledDays,
    learningSteps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    phase: state.phase,
    lastReview: state.lastReview,
  };
}

export async function getCard(
  db: Database,
  exerciseId: string,
): Promise<CardState | null> {
  const [row] = await db.select().from(cards).where(eq(cards.exerciseId, exerciseId));
  return row ? toCardState(row) : null;
}

/** Returns the existing card or persists `fresh` (the caller's newCard()). */
export async function getOrCreateCard(
  db: Database,
  exerciseId: string,
  fresh: CardState,
): Promise<CardState> {
  const existing = await getCard(db, exerciseId);
  if (existing) return existing;

  const [row] = await db
    .insert(cards)
    .values(toRow(exerciseId, fresh))
    .onConflictDoNothing()
    .returning();
  if (row) return toCardState(row);
  return (await getCard(db, exerciseId))!;
}

export async function saveCard(
  db: Database,
  exerciseId: string,
  state: CardState,
): Promise<CardState> {
  const row = toRow(exerciseId, state);
  const [saved] = await db
    .insert(cards)
    .values(row)
    .onConflictDoUpdate({ target: [cards.exerciseId], set: row })
    .returning();
  return toCardState(saved!);
}

/** Exercises whose card is due, oldest due first — the review queue.
 * `scope` narrows to one repertoire, chapter or origin; absent = all. */
export async function listDueExercises(
  db: Database,
  userId: string,
  now: Date = new Date(),
  scope: DrillScope = {},
) {
  return db
    .select({
      exerciseId: exercises.id,
      positionKey: exercises.positionKey,
      expectedSans: exercises.expectedSans,
      due: cards.due,
      phase: cards.phase,
    })
    .from(cards)
    .innerJoin(exercises, eq(cards.exerciseId, exercises.id))
    .where(
      and(
        eq(exercises.userId, userId),
        lte(cards.due, now),
        drillScopeCondition(db, scope),
      ),
    )
    .orderBy(asc(cards.due));
}

export interface DrillQueueCounts {
  /** Scheduled and past their due date. */
  due: number;
  /** Seeded but never scheduled — no card yet. */
  fresh: number;
  /**
   * The same total, split by what put the exercise there.
   *
   * An exercise carrying both origins counts once per origin, so these do
   * not sum to `due + fresh`. That is deliberate: the two numbers answer
   * "how much preparation is waiting" and "how many of my mistakes are
   * waiting", and an exercise that is both really is both. A caller
   * rendering them as slices of one bar would be wrong; as two piles they
   * are right.
   */
  byOrigin: Record<DrillOriginKind, number>;
}

/**
 * What the drill screen shows before serving anything.
 *
 * `/review/next` hands over one exercise, which is enough to practise and
 * not enough to decide whether to start. This is the count that turns an
 * empty screen into a choice.
 */
export async function countDrillQueue(
  db: Database,
  userId: string,
  now: Date = new Date(),
  scope: DrillScope = {},
): Promise<DrillQueueCounts> {
  const inScope = drillScopeCondition(db, scope);

  const [dueRow] = await db
    .select({ n: count() })
    .from(cards)
    .innerJoin(exercises, eq(cards.exerciseId, exercises.id))
    .where(and(eq(exercises.userId, userId), lte(cards.due, now), inScope));

  const [freshRow] = await db
    .select({ n: count() })
    .from(exercises)
    .where(
      and(
        eq(exercises.userId, userId),
        notExists(
          db
            .select({ one: cards.id })
            .from(cards)
            .where(eq(cards.exerciseId, exercises.id)),
        ),
        inScope,
      ),
    );

  // Waiting means due or never scheduled — a card scheduled for next week
  // is not something to offer today, and counting it would inflate every
  // number the screen shows.
  //
  // No DISTINCT: `exercise_sources` holds at most one row per (exercise,
  // origin) and an exercise has at most one card, so the join cannot
  // duplicate. A defensive DISTINCT here survived mutation testing, which
  // is a guard saying it guards nothing.
  const byOriginRows = await db
    .select({ origin: exerciseSources.origin })
    .from(exerciseSources)
    .innerJoin(exercises, eq(exerciseSources.exerciseId, exercises.id))
    .leftJoin(cards, eq(cards.exerciseId, exercises.id))
    .where(
      and(
        eq(exercises.userId, userId),
        or(isNull(cards.id), lte(cards.due, now)),
        inScope,
      ),
    );

  const byOrigin: Record<DrillOriginKind, number> = {
    "repertoire-deviation": 0,
    "engine-blunder": 0,
    "repertoire-line": 0,
  };
  for (const row of byOriginRows) byOrigin[row.origin] += 1;

  return { due: dueRow?.n ?? 0, fresh: freshRow?.n ?? 0, byOrigin };
}
