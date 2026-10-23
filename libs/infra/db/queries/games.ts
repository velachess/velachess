import type { NormalizedGame } from "@velachess/infra-platforms";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";

import type { Database } from "../client.ts";
import { perspectiveSql } from "./perspective.ts";
import { games, trackedAccounts } from "../schema.ts";

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

/** ~22 bind parameters per game, so 500 rows stay well under Postgres's
 * 65,535 per statement. */
const SAVE_GAMES_BATCH_SIZE = 500;

/**
 * A blocked insert is deduplication, not an error: the caller reads it from
 * the lower inserted count, and the unique constraints decide what
 * "duplicate" means per source. No transaction spans the batches, so a
 * failure keeps the ones before it and a retry re-inserts them as no-ops.
 */
export async function saveGames(
  db: Database,
  normalizedGames: NormalizedGame[],
  opts: { userId: string; accountId?: string },
): Promise<{ inserted: number }> {
  let inserted = 0;

  for (let start = 0; start < normalizedGames.length; start += SAVE_GAMES_BATCH_SIZE) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each batch commits independently, by design
    const rows = await db
      .insert(games)
      .values(
        normalizedGames
          .slice(start, start + SAVE_GAMES_BATCH_SIZE)
          .map((game) => toRow(game, opts.userId, opts.accountId)),
      )
      .onConflictDoNothing()
      .returning({ id: games.id });
    inserted += rows.length;
  }

  return { inserted };
}

/** Unscoped, for the worker and internal reads that already trust the id.
 * HTTP handlers use `getGameForUser`. */
export async function getGame(db: Database, gameId: string) {
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  return game ?? null;
}

/**
 * Ownership is the row's own `user_id`, checked in the query rather than
 * after the fetch, and the tracked-account join is provenance only: a LEFT
 * join, so a pasted PGN is scoped exactly like a synced game.
 *
 * `perspective` is derived rather than read off the column, which a synced
 * game stores null in. Serving that null made the review screen guess the
 * seat from handles the browser happened to remember, seating the opponent
 * at the bottom on any device that never ran the import.
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
 * Unscoped by owner: callers enforcing ownership check the tracked account
 * first (`@velachess/accounts`'s list-account-games). `perspective` is
 * derived for the reason `perspective.ts` states — a synced game stores
 * null in the column.
 */
export async function listGamesWithStatusForAccount(db: Database, accountId: string) {
  return (
    db
      .select({
        id: games.id,
        whiteName: games.whiteName,
        blackName: games.blackName,
        result: games.result,
        playedAt: games.playedAt,
        perspective: perspectiveSql,
        openingName: games.openingName,
      })
      .from(games)
      // Provenance, not ownership: LEFT, so a pasted PGN survives the read
      // and answers from its stored column.
      .leftJoin(trackedAccounts, eq(trackedAccounts.id, games.accountId))
      .where(eq(games.accountId, accountId))
      .orderBy(sql`${games.playedAt} desc nulls last`, desc(games.id))
  );
}
