/**
 * Synced archives and pasted PGNs in one list, where provenance is visible
 * per row but never decides what appears. Ownership is the games table's
 * own user_id.
 */
import type {
  GameFilters,
  GamePage,
  GameRow,
  ProviderProfile,
  ProviderSeat,
} from "@velachess/infra-db";
import type { AccountPlatform } from "@velachess/infra-platforms";

/** Mirrors get-game's, which a slice may not import; both project the
 * same row, so a dropped column fails to compile here too. */
type SeatIdentity = Pick<ProviderProfile, "avatarUrl" | "flair" | "countryCode">;

export interface Library {
  games: (GameRow & { whiteIdentity: SeatIdentity; blackIdentity: SeatIdentity })[];
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
/** The cache and nothing else: asking a provider per row would spend one
 * request per seat on every page turn. */
type FindProviderProfiles = (seats: ProviderSeat[]) => Promise<ProviderProfile[]>;

export interface ListGamesDeps {
  listGamesPage: ListGamesPage;
  findProviderProfiles: FindProviderProfiles;
}

const NO_IDENTITY: SeatIdentity = { avatarUrl: null, flair: null, countryCode: null };

function platformOf(source: GameRow["source"]): AccountPlatform | null {
  return source === "chess_com" || source === "lichess" ? source : null;
}

/** Case-folded: the cache must not fork on case. */
function seatKey(platform: AccountPlatform, username: string): string {
  return `${platform}:${username.toLowerCase()}`;
}

/** The same opponent across ten rows is one seat, read once. */
function seatsOf(rows: GameRow[]): ProviderSeat[] {
  const seats = new Map<string, ProviderSeat>();

  for (const row of rows) {
    const platform = platformOf(row.source);
    if (!platform) continue;
    for (const username of [row.whiteName, row.blackName]) {
      seats.set(seatKey(platform, username), { platform, username });
    }
  }

  return [...seats.values()];
}

export async function openLibrary(
  deps: ListGamesDeps,
  userId: string,
  view: { filters?: GameFilters; page?: GamePage } = {},
): Promise<Library> {
  const listed = await deps.listGamesPage(userId, view.filters, view.page);
  const cached = await deps.findProviderProfiles(seatsOf(listed.rows));
  const bySeat = new Map(
    cached.map(({ platform, username, avatarUrl, flair, countryCode }) => [
      seatKey(platform, username),
      { avatarUrl, flair, countryCode },
    ]),
  );

  const identityOf = (row: GameRow, username: string): SeatIdentity => {
    const platform = platformOf(row.source);
    if (!platform) return NO_IDENTITY;
    return bySeat.get(seatKey(platform, username)) ?? NO_IDENTITY;
  };

  return {
    games: listed.rows.map((row) => ({
      ...row,
      whiteIdentity: identityOf(row, row.whiteName),
      blackIdentity: identityOf(row, row.blackName),
    })),
    total: listed.total,
    page: listed.page,
    pageSize: listed.pageSize,
  };
}
