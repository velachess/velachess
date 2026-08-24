/**
 * GetGame — open one game for review.
 *
 * The read that fills the review screen: the game row plus both seats'
 * provider identity, resolved from the `provider_profiles` cache. The
 * cache is keyed by the handle, not the connection — an opponent needs no
 * tracked account to have a face — and a miss (or a stale entry) fetches
 * that seat's profile once and writes it through, so only the first open
 * per handle per refresh window spends a provider request. Two seats of
 * one game are inherently bounded; imports never fan out here.
 */
import type { Database } from "@velachess/db";
import {
  findProviderProfiles,
  getGameForUser,
  isProfileFresh,
  upsertProviderProfile,
  type ProviderSeat,
} from "@velachess/db";
import type { FetchFn } from "@velachess/platforms";
import {
  fetchChessComProfile,
  fetchLichessProfile,
  type ProfileFetch,
} from "@velachess/platforms";

type CachedProfile = Awaited<ReturnType<typeof findProviderProfiles>>[number];

export interface SeatIdentity {
  /** Provider profile picture. Null when unknown — initials stand in. */
  avatarUrl: string | null;
  /** Lichess asset id decorating the name. Never an avatar. */
  flair: string | null;
}

const NO_IDENTITY: SeatIdentity = { avatarUrl: null, flair: null };

/** Ask the provider once. The fetchers fail soft by contract — a dead
 * provider answers `failed`, never throws — so an outage costs the
 * decoration, never the game. */
async function fetchProfile(
  seat: ProviderSeat,
  doFetch: FetchFn | undefined,
): Promise<ProfileFetch> {
  const opts = doFetch ? { fetch: doFetch } : {};
  return seat.platform === "chess_com"
    ? fetchChessComProfile(seat.username, opts)
    : fetchLichessProfile(seat.username, opts);
}

/** Cache first; on miss or staleness, ask the provider once and serve
 * what the write-through actually kept — after a failed ask that is the
 * stored identity, not the emptiness the outage produced. */
async function resolveSeatIdentity(
  db: Database,
  seat: ProviderSeat,
  cached: CachedProfile | null,
  doFetch: FetchFn | undefined,
): Promise<SeatIdentity> {
  if (cached && isProfileFresh(cached.fetchedAt)) {
    return { avatarUrl: cached.avatarUrl, flair: cached.flair };
  }

  const stored = await upsertProviderProfile(db, seat, await fetchProfile(seat, doFetch));
  return { avatarUrl: stored.avatarUrl, flair: stored.flair };
}

export async function getGameForReview(
  db: Database,
  userId: string,
  gameId: string,
  deps: { fetch?: FetchFn } = {},
) {
  const game = await getGameForUser(db, userId, gameId);
  if (!game) return null;

  // A pasted PGN has no provider behind it — nobody to ask, initials for both.
  if (game.source !== "chess_com" && game.source !== "lichess") {
    return { ...game, whiteIdentity: NO_IDENTITY, blackIdentity: NO_IDENTITY };
  }

  const whiteSeat: ProviderSeat = { platform: game.source, username: game.whiteName };
  const blackSeat: ProviderSeat = { platform: game.source, username: game.blackName };
  const rows = await findProviderProfiles(db, [whiteSeat, blackSeat]);
  // Case-folded key on both sides: providers fold case, the cache must not fork on it.
  const rowOf = (seat: ProviderSeat): CachedProfile | null =>
    rows.find(
      (row) =>
        row.platform === seat.platform && row.username === seat.username.toLowerCase(),
    ) ?? null;

  // Independent handles, resolved concurrently — one cold open waits one
  // provider round trip, not two.
  const [whiteIdentity, blackIdentity] = await Promise.all([
    resolveSeatIdentity(db, whiteSeat, rowOf(whiteSeat), deps.fetch),
    resolveSeatIdentity(db, blackSeat, rowOf(blackSeat), deps.fetch),
  ]);

  return { ...game, whiteIdentity, blackIdentity };
}
