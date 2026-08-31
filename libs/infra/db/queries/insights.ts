import { asc, eq } from "drizzle-orm";

import type { Database } from "../client.ts";
import { gameAnalyses, games, trackedAccounts } from "../schema.ts";

/**
 * Every game the user has, oldest first, with whatever analysis exists —
 * the one broad read `@velachess/insights` builds every finding from. The
 * analysis rides along as a left join: a game without one still counts for
 * results and openings. So does the tracked account: a synced game needs
 * its username for perspective derivation, which the caller does.
 */
export async function listGamesForInsights(db: Database, userId: string) {
  return db
    .select({
      id: games.id,
      playedAt: games.playedAt,
      perspective: games.perspective,
      whiteName: games.whiteName,
      blackName: games.blackName,
      accountUsername: trackedAccounts.username,
      result: games.result,
      whiteRating: games.whiteRating,
      blackRating: games.blackRating,
      openingName: games.openingName,
      openingUrl: games.openingUrl,
      openingEco: games.openingEco,
      positions: gameAnalyses.positions,
    })
    .from(games)
    .leftJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    .leftJoin(gameAnalyses, eq(gameAnalyses.gameId, games.id))
    .where(eq(games.userId, userId))
    .orderBy(asc(games.playedAt), asc(games.id));
}
