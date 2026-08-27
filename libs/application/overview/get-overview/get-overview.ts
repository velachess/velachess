/**
 * GetOverview — the dashboard's four counters, one behavior, one place.
 * The SQL lives here because nothing else reads it: a count is this
 * screen's fact, not a shared capability.
 */
import { and, count, eq, lte } from "drizzle-orm";

import type { Database } from "@velachess/db";
import { schema } from "@velachess/db";

const { cards, deviations, exercises, games } = schema;

/** One-call counters for the stats endpoint — no N queries from HTTP. */
export async function getOverview(db: Database, userId: string, now: Date = new Date()) {
  const [gamesRow] = await db
    .select({ n: count() })
    .from(games)
    .where(eq(games.userId, userId));
  const [deviationsRow] = await db
    .select({ n: count() })
    .from(deviations)
    .innerJoin(games, eq(deviations.gameId, games.id))
    .where(and(eq(games.userId, userId), eq(deviations.type, "deviation")));
  const [exercisesRow] = await db
    .select({ n: count() })
    .from(exercises)
    .where(eq(exercises.userId, userId));
  const [dueRow] = await db
    .select({ n: count() })
    .from(cards)
    .innerJoin(exercises, eq(cards.exerciseId, exercises.id))
    .where(and(eq(exercises.userId, userId), lte(cards.due, now)));

  return {
    games: gamesRow?.n ?? 0,
    deviations: deviationsRow?.n ?? 0,
    exercises: exercisesRow?.n ?? 0,
    dueCards: dueRow?.n ?? 0,
  };
}
