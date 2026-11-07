/**
 * Synced archives and pasted PGNs in one list, where provenance is visible
 * per row but never decides what appears. Ownership is the games table's
 * own user_id.
 */
import { parsePgn, replayMainline } from "@velachess/chess";
import type { GameFilters, GamePage, GameRow } from "@velachess/infra-db";

const THUMBNAIL_PLIES = 16;

type ListedGame = Omit<GameRow, "rawPgn"> & { thumbnailFen: string | null };

function thumbnailFenOf(pgn: string): string | null {
  try {
    const game = parsePgn(pgn)[0];
    const replay = game && replayMainline(game, THUMBNAIL_PLIES);
    if (!replay?.isOk) return null;
    return replay.value.moves.at(-1)?.fenAfter ?? replay.value.startFen;
  } catch {
    return null;
  }
}

function listedGame({ rawPgn, ...row }: GameRow): ListedGame {
  return { ...row, thumbnailFen: thumbnailFenOf(rawPgn) };
}

export interface Library {
  games: ListedGame[];
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
  const { rows, ...paging } = await deps.listGamesPage(userId, view.filters, view.page);
  return { games: rows.map(listedGame), ...paging };
}
