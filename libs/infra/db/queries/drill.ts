/**
 * The persistence contracts, stated here rather than imported: db is the
 * bottom of the dependency graph and must not reach up into application
 * slices. The seeding slice's ExerciseSeed satisfies this structurally —
 * drift fails to typecheck at the call site, not silently.
 */
export type DrillGrade = "again" | "hard" | "good" | "easy";

export interface ExerciseSeedInput {
  positionKey: string;
  expectedSans: string[];
  origin:
    | { kind: "repertoire-deviation"; deviationId: string }
    | { kind: "engine-blunder"; gameId: string; ply: number }
    | { kind: "repertoire-line"; chapterId: string };
}
import { and, eq, exists, gt, notExists, or, type SQL } from "drizzle-orm";

import type { Database } from "../client.ts";
import {
  cards,
  deviations,
  exercises,
  exerciseSources,
  games,
  drillResponses,
  repertoireChapters,
  repertoires,
  type DrillOriginKind,
} from "../schema.ts";

export async function setDrillable(
  db: Database,
  deviationId: string,
  drillable: boolean,
) {
  const [updated] = await db
    .update(deviations)
    .set({ drillable })
    .where(eq(deviations.id, deviationId))
    .returning();
  return updated ?? null;
}

/**
 * The source row an origin writes. The union is destructured here rather
 * than in the caller so the mapping between the discriminant and the
 * columns lives in one place — the `CHECK` on the table is the other
 * half of the same statement.
 */
function sourceRow(exerciseId: string, origin: ExerciseSeedInput["origin"]) {
  switch (origin.kind) {
    case "repertoire-deviation":
      return { exerciseId, origin: origin.kind, deviationId: origin.deviationId };
    case "engine-blunder":
      return { exerciseId, origin: origin.kind, gameId: origin.gameId, ply: origin.ply };
    case "repertoire-line":
      return { exerciseId, origin: origin.kind, chapterId: origin.chapterId };
  }
}

/**
 * One exercise per (user, position). Two origins landing on the same one
 * is the point rather than an edge case — deviating from your preparation
 * in a position and later blundering in it is one thing to practise, with
 * two reasons to.
 *
 * When they collide, the preparation wins the *answer*: a repertoire seed
 * refreshes expectedSans, an engine seed only adds its provenance. The
 * engine is a strong opinion about the position; your book is a decision
 * about what you intend to play, and drilling should not quietly redirect
 * you away from it. The engine origin still earns the exercise its place
 * in the queue — it just does not get to rewrite the answer.
 */
export async function upsertExercise(
  db: Database,
  userId: string,
  seed: ExerciseSeedInput,
) {
  const row = { userId, positionKey: seed.positionKey, expectedSans: seed.expectedSans };
  const [exercise] = await db
    .insert(exercises)
    .values(row)
    .onConflictDoUpdate({
      target: [exercises.userId, exercises.positionKey],
      // Both repertoire kinds carry the preparation itself, so both
      // refresh the answer; the engine only adds its provenance.
      set:
        seed.origin.kind === "engine-blunder"
          ? { userId }
          : { expectedSans: seed.expectedSans },
    })
    .returning();

  await db
    .insert(exerciseSources)
    .values(sourceRow(exercise!.id, seed.origin))
    .onConflictDoNothing();

  return exercise!;
}

/**
 * Which slice of the queue a caller asked for. Every field narrows; an
 * empty scope is the whole queue. `chapterId`/`repertoireId` reach both
 * repertoire origins — a line seeded from the chapter and a real-game
 * deviation judged against it are both "training this chapter".
 */
export interface DrillScope {
  origin?: DrillOriginKind;
  repertoireId?: string;
  chapterId?: string;
}

/**
 * The EXISTS an exercise must satisfy to be in scope — composable into
 * any query that selects from `exercises`. Lives here so `/drill/next`,
 * `/drill/queue` and whatever comes later agree on what a scope means
 * instead of three re-derivations drifting apart.
 */
export function drillScopeCondition(db: Database, scope: DrillScope): SQL | undefined {
  if (!scope.origin && !scope.repertoireId && !scope.chapterId) return undefined;

  const conditions: SQL[] = [eq(exerciseSources.exerciseId, exercises.id)];
  if (scope.origin) conditions.push(eq(exerciseSources.origin, scope.origin));
  if (scope.chapterId) {
    conditions.push(
      or(
        eq(exerciseSources.chapterId, scope.chapterId),
        eq(deviations.chapterId, scope.chapterId),
      )!,
    );
  }
  if (scope.repertoireId) {
    conditions.push(
      or(
        eq(repertoireChapters.repertoireId, scope.repertoireId),
        eq(deviations.repertoireId, scope.repertoireId),
      )!,
    );
  }

  return exists(
    db
      .select({ one: exerciseSources.id })
      .from(exerciseSources)
      .leftJoin(deviations, eq(exerciseSources.deviationId, deviations.id))
      .leftJoin(repertoireChapters, eq(exerciseSources.chapterId, repertoireChapters.id))
      .where(and(...conditions)),
  );
}

/** An exercise that has never been scheduled — the "learn something new"
 * pick when nothing is due. `scope` narrows the pile the same way it
 * narrows the due queue. */
export async function getNewExercise(
  db: Database,
  userId: string,
  scope: DrillScope = {},
) {
  const [exercise] = await db
    .select()
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
        drillScopeCondition(db, scope),
      ),
    )
    .limit(1);
  return exercise ?? null;
}

/**
 * Pulls an exercise's review to now, never pushes it later. The one
 * caller is the deviation triage: failing a prepared position in a real
 * game is the strongest evidence its scheduled interval was too long,
 * and the honest correction is "review it now", not an invented
 * difficulty multiplier. No card yet = nothing to pull; the exercise is
 * already in the new pile.
 */
export async function pullCardDueNow(db: Database, exerciseId: string, now: Date) {
  await db
    .update(cards)
    .set({ due: now })
    .where(and(eq(cards.exerciseId, exerciseId), gt(cards.due, now)));
}

export async function recordResponse(
  db: Database,
  exerciseId: string,
  response: { correct: boolean; grade: DrillGrade; responseTimeMs?: number },
) {
  const [saved] = await db
    .insert(drillResponses)
    .values({
      exerciseId,
      correct: response.correct,
      grade: response.grade,
      responseTimeMs: response.responseTimeMs ?? null,
    })
    .returning();
  return saved!;
}

/** A user's exercises — the db-layer read the acceptance tests observe
 * the triage through, so they do not have to reach for drizzle. */
export async function listExercisesByUser(db: Database, userId: string) {
  return db.select().from(exercises).where(eq(exercises.userId, userId));
}

/**
 * Scoped by owner — the HTTP shape. An answer writes a response row and
 * reschedules an FSRS card, so the exercise id in a request body is a
 * claim, not a proof; the session decides whose card moves.
 */
export async function getExerciseForUser(
  db: Database,
  userId: string,
  exerciseId: string,
) {
  const [exercise] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)));
  return exercise ?? null;
}

export interface DrillContext {
  origin: DrillOriginKind;
  /** The move you actually played, so the screen can contrast it with the
   * right answer. Null when the record does not carry it. */
  playedSan: string | null;
  /**
   * Where this came from, in words a person recognises: the chapter of
   * your book, or the game and move number. Without it a drill is a
   * position floating free of the game that produced it, which is what
   * makes a tool feel like a puzzle app instead of your own history.
   */
  label: string | null;
}

/**
 * Which origin explains this exercise, and what it can say about itself.
 *
 * An exercise can carry both — deviating from your book in a position and
 * later blundering in it is one exercise with two provenances. The
 * repertoire wins the explanation for the same reason it wins the answer:
 * `expectedSans` holds your preparation, so "the engine preferred Nc3"
 * would describe a move the drill does not accept.
 *
 * Null when an exercise somehow has no source row. The screen falls back
 * to a neutral sentence rather than asserting a provenance it lacks.
 */
export async function drillContextOf(
  db: Database,
  exerciseId: string,
): Promise<DrillContext | null> {
  // A real-game failure explains a drill better than the chapter it sits
  // in, and the chapter better than the engine's opinion — so provenance
  // is asked for in that order.
  return (
    (await deviationContext(db, exerciseId)) ??
    (await lineContext(db, exerciseId)) ??
    engineContext(db, exerciseId)
  );
}

async function lineContext(
  db: Database,
  exerciseId: string,
): Promise<DrillContext | null> {
  const [row] = await db
    .select({
      chapter: repertoireChapters.name,
      repertoire: repertoires.name,
    })
    .from(exerciseSources)
    .innerJoin(repertoireChapters, eq(exerciseSources.chapterId, repertoireChapters.id))
    .innerJoin(repertoires, eq(repertoireChapters.repertoireId, repertoires.id))
    .where(
      and(
        eq(exerciseSources.exerciseId, exerciseId),
        eq(exerciseSources.origin, "repertoire-line"),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    origin: "repertoire-line",
    // Nothing was played — this position comes from the book, not a game.
    playedSan: null,
    label: `${row.repertoire} — ${row.chapter}`,
  };
}

async function deviationContext(
  db: Database,
  exerciseId: string,
): Promise<DrillContext | null> {
  const [row] = await db
    .select({
      playedSan: deviations.playedSan,
      repertoire: deviations.repertoireNameSnapshot,
      chapter: deviations.chapterNameSnapshot,
    })
    .from(exerciseSources)
    .innerJoin(deviations, eq(exerciseSources.deviationId, deviations.id))
    .where(
      and(
        eq(exerciseSources.exerciseId, exerciseId),
        eq(exerciseSources.origin, "repertoire-deviation"),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    origin: "repertoire-deviation",
    playedSan: row.playedSan,
    label: `${row.repertoire} — ${row.chapter}`,
  };
}

async function engineContext(
  db: Database,
  exerciseId: string,
): Promise<DrillContext | null> {
  const [row] = await db
    .select({
      ply: exerciseSources.ply,
      white: games.whiteName,
      black: games.blackName,
      perspective: games.perspective,
    })
    .from(exerciseSources)
    .innerJoin(games, eq(exerciseSources.gameId, games.id))
    .where(
      and(
        eq(exerciseSources.exerciseId, exerciseId),
        eq(exerciseSources.origin, "engine-blunder"),
      ),
    )
    .limit(1);

  if (!row) return null;
  const opponent = row.perspective === "black" ? row.white : row.black;
  return {
    origin: "engine-blunder",
    // The move you played lives in the analysis blob, which this query
    // does not open. Absent rather than wrong.
    playedSan: null,
    label: row.ply === null ? opponent : `Move ${moveNumberOf(row.ply)} vs ${opponent}`,
  };
}

/** Plies are half-moves; people count whole ones. Plies 1 and 2 are move 1. */
function moveNumberOf(ply: number): number {
  return Math.ceil(ply / 2);
}
