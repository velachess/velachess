/**
 * Both seats' identity comes from the `provider_profiles` cache, keyed by
 * the handle rather than the connection, so an opponent needs no tracked
 * account to have a face. A miss or a stale entry fetches once and writes
 * through, so only the first open per handle per refresh window spends a
 * provider request.
 */
import type { Game, ProviderProfile, ProviderSeat } from "@velachess/infra-db";
import type { FetchFn } from "@velachess/infra-platforms";
import {
  fetchChessComProfile,
  fetchLichessProfile,
  type ProfileFetch,
} from "@velachess/infra-platforms";

/** What the cache knows about a seat, minus its bookkeeping. */
export type SeatIdentity = Pick<ProviderProfile, "avatarUrl" | "flair" | "countryCode">;

type GetGameForUser = (userId: string, gameId: string) => Promise<Game | null>;
type FindProviderProfiles = (seats: ProviderSeat[]) => Promise<ProviderProfile[]>;
type UpsertProviderProfile = (
  seat: ProviderSeat,
  fetched: ProfileFetch,
) => Promise<SeatIdentity>;
/** A profile stays fresh for a fixed window from when it was fetched. */
type IsProfileFresh = (fetchedAt: Date) => boolean;

export interface GetGameDeps {
  getGameForUser: GetGameForUser;
  findProviderProfiles: FindProviderProfiles;
  upsertProviderProfile: UpsertProviderProfile;
  isProfileFresh: IsProfileFresh;
  /** Composed once at wiring time; never varies per call. */
  fetch?: FetchFn;
}

const NO_IDENTITY: SeatIdentity = { avatarUrl: null, flair: null, countryCode: null };

/** The fetchers fail soft by contract, a dead provider answering `failed`
 * rather than throwing, so an outage costs the decoration, not the
 * game. */
async function fetchProfile(seat: ProviderSeat, doFetch: FetchFn | undefined) {
  const opts = doFetch ? { fetch: doFetch } : {};
  return seat.platform === "chess_com"
    ? fetchChessComProfile(seat.username, opts)
    : fetchLichessProfile(seat.username, opts);
}

/** Projected, so that bookkeeping never reaches a caller. */
function identityOf({ avatarUrl, flair, countryCode }: SeatIdentity): SeatIdentity {
  return { avatarUrl, flair, countryCode };
}

/** Serves what the write-through kept, which after a failed ask is the
 * stored identity rather than the emptiness the outage produced. */
async function resolveSeatIdentity(
  deps: GetGameDeps,
  seat: ProviderSeat,
  cached: ProviderProfile | null,
): Promise<SeatIdentity> {
  if (cached && deps.isProfileFresh(cached.fetchedAt)) {
    return identityOf(cached);
  }

  return identityOf(
    await deps.upsertProviderProfile(seat, await fetchProfile(seat, deps.fetch)),
  );
}

export async function getGameForReview(
  deps: GetGameDeps,
  userId: string,
  gameId: string,
) {
  const game = await deps.getGameForUser(userId, gameId);
  if (!game) return null;

  // A pasted PGN has no provider to ask.
  if (game.source !== "chess_com" && game.source !== "lichess") {
    return { ...game, whiteIdentity: NO_IDENTITY, blackIdentity: NO_IDENTITY };
  }

  const whiteSeat: ProviderSeat = { platform: game.source, username: game.whiteName };
  const blackSeat: ProviderSeat = { platform: game.source, username: game.blackName };
  const rows = await deps.findProviderProfiles([whiteSeat, blackSeat]);
  // Case-folded on both sides: the cache must not fork on case.
  const rowOf = (seat: ProviderSeat): ProviderProfile | null =>
    rows.find(
      (row) =>
        row.platform === seat.platform && row.username === seat.username.toLowerCase(),
    ) ?? null;

  // Concurrently, so one cold open waits one provider round trip, not
  // two.
  const [whiteIdentity, blackIdentity] = await Promise.all([
    resolveSeatIdentity(deps, whiteSeat, rowOf(whiteSeat)),
    resolveSeatIdentity(deps, blackSeat, rowOf(blackSeat)),
  ]);

  return { ...game, whiteIdentity, blackIdentity };
}
