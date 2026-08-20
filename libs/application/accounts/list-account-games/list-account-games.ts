/**
 * ListAccountGames — one tracked handle's games with judgment type and
 * analysis presence, the read model the account screen renders.
 */
import { desc, eq, isNotNull, sql } from "drizzle-orm";

import type { Database } from "@velachess/db";
import { schema } from "@velachess/db";

const { deviations, gameAnalyses, games } = schema;

/** Game list with judgment type and analysis presence in one join — what a
 * game-list UI renders without N+1. rawPgn deliberately excluded.
 * Judgments accumulate per repertoire (cycle 6): DISTINCT ON picks the
 * most actionable one per game — a deviation beats any other type, then
 * the newest wins. Final ordering (playedAt desc) happens after the
 * distinct, in memory, because DISTINCT ON pins the SQL sort to game id. */
export async function listGamesWithStatus(db: Database, accountId: string) {
  const rows = await db
    .selectDistinctOn([games.id], {
      id: games.id,
      whiteName: games.whiteName,
      blackName: games.blackName,
      result: games.result,
      playedAt: games.playedAt,
      perspective: games.perspective,
      openingName: games.openingName,
      judgmentType: deviations.type,
      judgmentPly: deviations.ply,
      analyzed: isNotNull(gameAnalyses.id),
    })
    .from(games)
    .leftJoin(deviations, eq(deviations.gameId, games.id))
    .leftJoin(gameAnalyses, eq(gameAnalyses.gameId, games.id))
    .where(eq(games.accountId, accountId))
    .orderBy(
      games.id,
      sql`case when ${deviations.type} = 'deviation' then 0 else 1 end`,
      desc(deviations.createdAt),
    );

  return rows.toSorted(
    (a, b) => (b.playedAt?.getTime() ?? 0) - (a.playedAt?.getTime() ?? 0),
  );
}
