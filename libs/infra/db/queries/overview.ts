import { and, count, eq, lte } from "drizzle-orm";

import type { Database } from "../client.ts";
import { cards, deviations, exercises, games } from "../schema.ts";

export async function countGames(db: Database, userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(games)
    .where(eq(games.userId, userId));
  return row?.n ?? 0;
}

export async function countOwnDeviations(db: Database, userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(deviations)
    .innerJoin(games, eq(deviations.gameId, games.id))
    .where(and(eq(games.userId, userId), eq(deviations.type, "deviation")));
  return row?.n ?? 0;
}

export async function countExercises(db: Database, userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(exercises)
    .where(eq(exercises.userId, userId));
  return row?.n ?? 0;
}

export async function countDueCards(db: Database, userId: string, now: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(cards)
    .innerJoin(exercises, eq(cards.exerciseId, exercises.id))
    .where(and(eq(exercises.userId, userId), lte(cards.due, now)));
  return row?.n ?? 0;
}
