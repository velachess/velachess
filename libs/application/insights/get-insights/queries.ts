/** The one read: every game of the user's, with whatever analysis exists. */
import { asc, eq } from "drizzle-orm";

import type { Database } from "@velachess/db";
import { schema } from "@velachess/db";
import { openingFamily } from "@velachess/platforms";

import type { GameSample } from "./sample.ts";
import { resolveGamePerspective } from "../../perspective.ts";

const { games, gameAnalyses, trackedAccounts } = schema;

/**
 * Oldest first, because the trend source windows over time. The analysis
 * rides along as a left join — a game without one still counts for
 * results and openings, and its `plies` are honestly null rather than
 * empty. So does the provenance account: a synced game needs its
 * username for perspective derivation; a PGN import has none and stays.
 */
export async function listInsightGames(
  db: Database,
  userId: string,
): Promise<GameSample[]> {
  const rows = await db
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

  return rows.map((row) => ({
    id: row.id,
    playedAt: row.playedAt,
    // Synced games store no perspective — only a pasted PGN declares
    // one. Every own-side calculation would silently count the whole
    // history as losses without this derivation.
    perspective: resolveGamePerspective(row),
    result: row.result,
    whiteRating: row.whiteRating,
    blackRating: row.blackRating,
    // The family, not the raw header: chess.com sends no `Opening` at
    // all (name is null on every game it imports), and Lichess's full
    // "Family: Variation" scatters one opening across buckets the
    // five-game floor can never fill. Derived at read time so history
    // imported before this existed is served without a re-import.
    openingName: openingFamily(row.openingName, row.openingUrl),
    openingEco: row.openingEco,
    plies: row.positions,
  }));
}
