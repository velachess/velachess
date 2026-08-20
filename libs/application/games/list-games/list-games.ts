/**
 * ListGames — one page of a tracked handle's archive, filtered.
 *
 * A read and nothing but a read: an untracked username answers null
 * ("import it first") rather than creating a connection.
 */
import type { Database, GameFilters, GamePage } from "@velachess/db";
import { findTrackedAccount, listGamesPage } from "@velachess/db";

export type Platform = "chess_com" | "lichess";

export interface Archive {
  account: {
    id: string;
    platform: Platform;
    username: string;
    lastSyncedAt: Date | null;
  };
  games: Awaited<ReturnType<typeof listGamesPage>>["rows"];
  /** Matching the filters, not the page — the pager needs the whole count. */
  total: number;
  page: number;
  pageSize: number;
}

/**
 * "Show me this player's games" — a read, and now nothing but a read.
 *
 * Null when the caller does not track this handle: reads no longer
 * create connections or move ownership, so an untracked username is an
 * answer ("import it first"), not a trigger.
 */
export async function openArchive(
  db: Database,
  userId: string,
  platform: Platform,
  username: string,
  view: { filters?: GameFilters; page?: GamePage } = {},
): Promise<Archive | null> {
  const account = await findTrackedAccount(db, userId, platform, username);
  if (!account) return null;

  const listed = await listGamesPage(db, account, view.filters, view.page);

  return {
    account: {
      id: account.id,
      platform: account.platform,
      username: account.username,
      lastSyncedAt: account.lastSyncedAt,
    },
    games: listed.rows,
    total: listed.total,
    page: listed.page,
    pageSize: listed.pageSize,
  };
}
