/**
 * ListGames — one page of the user's unified library, filtered.
 *
 * Every game the user owns in one list: synced Chess.com and Lichess
 * archives next to manually imported PGNs, provenance visible per row
 * but never deciding what appears here. Ownership is the games table's
 * own user_id — a read, and nothing but a read.
 */
import type { Database, GameFilters, GamePage } from "@velachess/db";
import { listGamesPage } from "@velachess/db";

export interface Library {
  games: Awaited<ReturnType<typeof listGamesPage>>["rows"];
  /** Matching the filters, not the page — the pager needs the whole count. */
  total: number;
  page: number;
  pageSize: number;
}

/** "Show me my games" — every source at once. */
export async function openLibrary(
  db: Database,
  userId: string,
  view: { filters?: GameFilters; page?: GamePage } = {},
): Promise<Library> {
  const listed = await listGamesPage(db, userId, view.filters, view.page);

  return {
    games: listed.rows,
    total: listed.total,
    page: listed.page,
    pageSize: listed.pageSize,
  };
}
