/**
 * The reads behind repertoire statistics — grouping and counting only.
 * Interpretation (product vocabulary, rates, what counts as a gap worth
 * showing) belongs to the application slice; this file never decides,
 * it fetches.
 */

import { and, count, desc, eq, max, notExists, sql } from "drizzle-orm";

import type { Database } from "../client.ts";
import { deviations, games, repertoireChapters, trackedAccounts } from "../schema.ts";

/** Judgment rows per outcome type, one count each. */
export async function countJudgmentsByType(db: Database, repertoireId: string) {
  return db
    .select({ type: deviations.type, n: count() })
    .from(deviations)
    .where(eq(deviations.repertoireId, repertoireId))
    .groupBy(deviations.type);
}

/** Per chapter and outcome. Live chapter name when the chapter still
 * exists; the snapshot keeps deleted chapters countable. */
export async function countJudgmentsByChapter(db: Database, repertoireId: string) {
  return db
    .select({
      chapterId: deviations.chapterId,
      chapterName: sql<
        string | null
      >`coalesce(${repertoireChapters.name}, ${deviations.chapterNameSnapshot})`,
      type: deviations.type,
      n: count(),
    })
    .from(deviations)
    .leftJoin(repertoireChapters, eq(deviations.chapterId, repertoireChapters.id))
    .where(eq(deviations.repertoireId, repertoireId))
    .groupBy(
      deviations.chapterId,
      repertoireChapters.name,
      deviations.chapterNameSnapshot,
      deviations.type,
    );
}

/**
 * The opponent moves preparation has no answer to, most frequent first.
 * Grouped on the position AND the move — the same uncovered reply in two
 * games is one gap with two occurrences, which is what makes it worth
 * preparing. A sample game rides along so the gap can be opened.
 */
export async function topPreparationGaps(db: Database, repertoireId: string, limit = 10) {
  return db
    .select({
      positionKey: deviations.positionKey,
      san: deviations.playedSan,
      ply: max(deviations.ply),
      games: count(),
      // Not max(): Postgres has no max(uuid). The most recent occurrence
      // is the sample worth opening anyway.
      sampleGameId: sql<
        string | null
      >`(array_agg(${deviations.gameId} order by ${deviations.createdAt} desc))[1]`,
    })
    .from(deviations)
    .where(and(eq(deviations.repertoireId, repertoireId), eq(deviations.type, "gap")))
    .groupBy(deviations.positionKey, deviations.playedSan)
    .orderBy(desc(count()), deviations.positionKey)
    .limit(limit);
}

/**
 * The games this repertoire never judged (unmatched), with what they
 * opened as — raw name and url per game; grouping into families is the
 * caller's interpretation, using the same derivation every other reader
 * applies.
 */
export async function listUnmatchedGames(db: Database, repertoireId: string) {
  return db
    .select({
      gameId: deviations.gameId,
      openingName: games.openingName,
      openingUrl: games.openingUrl,
    })
    .from(deviations)
    .innerJoin(games, eq(deviations.gameId, games.id))
    .where(
      and(eq(deviations.repertoireId, repertoireId), eq(deviations.type, "unmatched")),
    );
}

/**
 * Games of the user's that no repertoire has judged at all — not even as
 * unmatched. Zero for a user whose judge runs are current; the number
 * exists so "not judged yet" and "judged, unmatched" stay two answers.
 */
export async function countUnjudgedGames(db: Database, userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(games)
    .innerJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    .where(
      and(
        eq(trackedAccounts.userId, userId),
        notExists(
          db
            .select({ one: deviations.id })
            .from(deviations)
            .where(eq(deviations.gameId, games.id)),
        ),
      ),
    );
  return row?.n ?? 0;
}
