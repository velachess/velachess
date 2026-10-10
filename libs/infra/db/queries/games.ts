import type { NormalizedGame } from "@velachess/infra-platforms";
import { and, desc, eq, getTableColumns, isNotNull, sql, type SQL } from "drizzle-orm";

import type { Database } from "../client.ts";
import { perspectiveSql } from "./perspective.ts";
import { gameAnalyses, games, trackedAccounts } from "../schema.ts";

function toRow(game: NormalizedGame, userId: string, accountId: string | undefined) {
  return {
    userId,
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

/**
 * Conflict-ignore persistence: a blocked insert is deduplication, not an
 * error — the caller reads it from the lower inserted count. Ownership is
 * always the user's; `accountId` is provenance only (a manual PGN import
 * has none), and the unique constraints decide what "duplicate" means per
 * source.
 */
export async function saveGames(
  db: Database,
  normalizedGames: NormalizedGame[],
  opts: { userId: string; accountId?: string },
): Promise<{ inserted: number }> {
  if (normalizedGames.length === 0) return { inserted: 0 };

  const inserted = await db
    .insert(games)
    .values(normalizedGames.map((game) => toRow(game, opts.userId, opts.accountId)))
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
  opts: { userId?: string; accountId?: string; limit?: number; offset?: number } = {},
) {
  const scopes: SQL[] = [];
  if (opts.userId) scopes.push(eq(games.userId, opts.userId));
  if (opts.accountId) scopes.push(eq(games.accountId, opts.accountId));

  const query = db
    .select(gameListColumns)
    .from(games)
    .where(scopes.length > 0 ? and(...scopes) : undefined)
    .orderBy(desc(games.playedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);

  return query;
}

/**
 * The full row, rawPgn included — board rendering needs it.
 * Unscoped: for the WORKER and for internal reads that already trust the
 * id. HTTP handlers use `getGameForUser`.
 */
export async function getGame(db: Database, gameId: string) {
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  return game ?? null;
}

/**
 * The full row, only if the caller owns it, with the seat resolved.
 *
 * Ownership is still the row's own `user_id`, checked in the query
 * rather than after the fetch: there is no window where the row exists
 * in memory for a caller it does not belong to. The tracked-account
 * join added for `perspective` is provenance only and never widens
 * that — it is a LEFT join, so a manually imported PGN is scoped
 * exactly like a synced game and simply has no account to match.
 *
 * `perspective` is derived rather than read straight off the column,
 * because a synced game stores null there. Serving that null made the
 * review screen fall back to guessing the seat from a list of handles
 * the browser happens to remember, which seats the opponent at the
 * bottom on any device that never ran the import.
 */
export async function getGameForUser(db: Database, userId: string, gameId: string) {
  const [row] = await db
    .select({ ...getTableColumns(games), perspective: perspectiveSql })
    .from(games)
    .leftJoin(trackedAccounts, eq(trackedAccounts.id, games.accountId))
    .where(and(eq(games.id, gameId), eq(games.userId, userId)));
  return row ?? null;
}

/**
 * Game list with analysis presence in one join — what a game-list UI
 * renders without N+1. rawPgn deliberately excluded. Unscoped by owner —
 * callers that need ownership enforced check the tracked account first
 * (see `@velachess/accounts`'s list-account-games).
 */
export async function listGamesWithStatusForAccount(db: Database, accountId: string) {
  return db
    .select({
      id: games.id,
      whiteName: games.whiteName,
      blackName: games.blackName,
      result: games.result,
      playedAt: games.playedAt,
      perspective: games.perspective,
      openingName: games.openingName,
      analyzed: sql<boolean>`${isNotNull(gameAnalyses.id)}`,
    })
    .from(games)
    .leftJoin(gameAnalyses, eq(gameAnalyses.gameId, games.id))
    .where(eq(games.accountId, accountId))
    .orderBy(sql`${games.playedAt} desc nulls last`, desc(games.id));
}
