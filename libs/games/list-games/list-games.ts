/**
 * Synced archives and pasted PGNs in one list, where provenance is visible
 * per row but never decides what appears. Ownership is the games table's
 * own user_id.
 */
import type { GameFilters, GamePage, GameRow } from "@velachess/infra-db";

export interface Library {
  games: GameRow[];
  /** Matching the filters, not the page: the pager needs the whole
   * count. */
  total: number;
  page: number;
  pageSize: number;
}

type ListGamesPage = (
  userId: string,
  filters?: GameFilters,
  page?: GamePage,
) => Promise<{ rows: GameRow[]; total: number; page: number; pageSize: number }>;

export interface ListGamesDeps {
  listGamesPage: ListGamesPage;
}

export async function openLibrary(
  deps: ListGamesDeps,
  userId: string,
  view: { filters?: GameFilters; page?: GamePage } = {},
): Promise<Library> {
  const listed = await deps.listGamesPage(userId, view.filters, view.page);

  return {
    games: listed.rows,
    total: listed.total,
    page: listed.page,
    pageSize: listed.pageSize,
  };
}
