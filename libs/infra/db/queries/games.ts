import type { NormalizedGame } from "@velachess/platforms";
import { and, desc, eq } from "drizzle-orm";

import type { Database } from "../client.ts";
import { games, trackedAccounts } from "../schema.ts";

function toRow(game: NormalizedGame, accountId: string | undefined) {
  return {
    source: game.source,
    externalId: game.externalId,
    externalUrl: game.externalUrl,
    accountId: accountId ?? null,
    perspective: game.perspective,
    whiteName: game.white.name,
    whiteRating: game.white.rating ?? null,
    blackName: game.black.name,
    blackRating: game.black.rating ?? null,
    result: game.result,
    playedAt: game.playedAt ?? null,
    timeControlInitialSeconds: game.timeControl.initialSeconds ?? null,
    timeControlIncrementSeconds: game.timeControl.incrementSeconds ?? null,
    timeControlRaw: game.timeControl.raw ?? null,
    openingEco: game.opening.eco ?? null,
    openingName: game.opening.name ?? null,
    openingUrl: game.opening.url ?? null,
    termination: game.termination ?? null,
    hasClocks: game.hasClocks,
    rawPgn: game.rawPgn,
    movetextHash: game.movetextHash,
  };
}

export async function saveGames(
  db: Database,
  normalizedGames: NormalizedGame[],
  opts: { accountId?: string } = {},
): Promise<{ inserted: number }> {
  if (normalizedGames.length === 0) return { inserted: 0 };

  const inserted = await db
    .insert(games)
    .values(normalizedGames.map((game) => toRow(game, opts.accountId)))
    .onConflictDoNothing()
    .returning({ id: games.id });

  return { inserted: inserted.length };
}

// Excludes rawPgn/movetextHash — a list view doesn't need the full PGN text
// or the internal dedup key. Fetch a single game (with rawPgn) separately
// once a reader actually needs it.
const gameListColumns = {
  id: games.id,
  source: games.source,
  externalId: games.externalId,
  externalUrl: games.externalUrl,
  accountId: games.accountId,
  perspective: games.perspective,
  whiteName: games.whiteName,
  whiteRating: games.whiteRating,
  blackName: games.blackName,
  blackRating: games.blackRating,
  result: games.result,
  playedAt: games.playedAt,
  timeControlInitialSeconds: games.timeControlInitialSeconds,
  timeControlIncrementSeconds: games.timeControlIncrementSeconds,
  timeControlRaw: games.timeControlRaw,
  openingEco: games.openingEco,
  openingName: games.openingName,
  openingUrl: games.openingUrl,
  termination: games.termination,
  hasClocks: games.hasClocks,
  createdAt: games.createdAt,
};

export async function listGames(
  db: Database,
  opts: { accountId?: string; limit?: number; offset?: number } = {},
) {
  const query = db
    .select(gameListColumns)
    .from(games)
    .orderBy(desc(games.playedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);

  return opts.accountId ? query.where(eq(games.accountId, opts.accountId)) : query;
}

/**
 * The full row, rawPgn included — board rendering and re-judging need it.
 * Unscoped: for the WORKER and for internal reads that already trust the
 * id. HTTP handlers use `getGameForUser`.
 */
export async function getGame(db: Database, gameId: string) {
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  return game ?? null;
}

/**
 * The full row, only if the caller owns it — ownership rides through
 * `games.account_id → tracked_accounts.user_id`, scoped in the query
 * rather than checked after the fetch, so there is no window where the
 * row exists in memory for a caller it does not belong to.
 */
export async function getGameForUser(db: Database, userId: string, gameId: string) {
  const [row] = await db
    .select({ game: games })
    .from(games)
    .innerJoin(trackedAccounts, eq(games.accountId, trackedAccounts.id))
    .where(and(eq(games.id, gameId), eq(trackedAccounts.userId, userId)));
  return row?.game ?? null;
}
