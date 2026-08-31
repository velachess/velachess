/**
 * ConnectAccount — start tracking a chess.com/Lichess handle.
 *
 * The only place a connection is created. First contact also fills the
 * archive (via the sync slice's fetch half), so a bad username fails in
 * front of the person who typed it.
 *
 * `syncAccount` is its own module-mate in `@velachess/accounts`, yet it
 * is external to this slice exactly like any other module's capability —
 * a slice never calls another slice's handler directly, same module or
 * not. The composition root wires the real `syncAccount` (sourced from
 * this module's own `index.ts`) into the `SyncAccount` type declared
 * below.
 */
import type { FetchFn, ProfileFetch } from "@velachess/infra-platforms";
import { fetchChessComProfile, fetchLichessProfile } from "@velachess/infra-platforms";
import type { ProviderSeat, TrackedAccount } from "@velachess/infra-db";

export type Platform = "chess_com" | "lichess";

interface CachedProfile {
  platform: Platform;
  username: string;
  fetchedAt: Date;
  avatarUrl: string | null;
  flair: string | null;
}

type FindProviderProfiles = (seats: ProviderSeat[]) => Promise<CachedProfile[]>;
type UpsertProviderProfile = (
  seat: ProviderSeat,
  fetched: ProfileFetch,
) => Promise<{ avatarUrl: string | null; flair: string | null }>;
/** Pure — a profile stays fresh for a fixed window from when it was fetched. */
type IsProfileFresh = (fetchedAt: Date) => boolean;
type UpsertTrackedAccount = (
  userId: string,
  platform: Platform,
  username: string,
) => Promise<TrackedAccount>;
type GetTrackedAccount = (accountId: string) => Promise<TrackedAccount | null>;
/**
 * `sync-account`'s own outcome, narrowed to the one field this slice
 * reads — this slice declares its dependency in its own vocabulary
 * rather than importing `SyncOutcome` from its module-mate's file.
 */
type SyncAccount = (accountId: string) => Promise<{ saved: number }>;
type EnsureCandidateRepertoires = (
  userId: string,
  opts: { newGames: number },
) => Promise<void>;

export interface ConnectAccountDeps {
  findProviderProfiles: FindProviderProfiles;
  upsertProviderProfile: UpsertProviderProfile;
  isProfileFresh: IsProfileFresh;
  upsertTrackedAccount: UpsertTrackedAccount;
  getTrackedAccount: GetTrackedAccount;
  syncAccount: SyncAccount;
  ensureCandidateRepertoires: EnsureCandidateRepertoires;
  /** Composed once, at wiring time — the fixture a test harness reads
   * through instead of the network. Never varies per call. */
  fetch?: FetchFn;
}

/**
 * Read the provider's picture of this handle at the moment the connection
 * is made — warming the shared `provider_profiles` cache so this handle's
 * first game review needs no provider request. A row another user (or an
 * earlier connect) already asked for within the refresh window is reused,
 * not re-asked: connecting is not a refresh button.
 *
 * The read is decoration around the name and fails soft by contract
 * (the fetchers answer an empty profile rather than throw), so a provider
 * outage costs the avatar, never the connection.
 */
async function warmProfileCache(
  deps: ConnectAccountDeps,
  platform: Platform,
  username: string,
) {
  const [cached] = await deps.findProviderProfiles([{ platform, username }]);
  if (cached && deps.isProfileFresh(cached.fetchedAt)) return;

  const opts = deps.fetch ? { fetch: deps.fetch } : {};
  const fetched =
    platform === "chess_com"
      ? await fetchChessComProfile(username, opts)
      : await fetchLichessProfile(username, opts);
  // The write-through decides what a failed ask keeps versus what an
  // answer overwrites; connecting only needs the side effect.
  await deps.upsertProviderProfile({ platform, username }, fetched);
}

/**
 * Start tracking a handle: create (or find) the user's connection to it,
 * and fill the archive on first contact.
 *
 * This is the WRITE half of what used to be one function. `openArchive`
 * previously upserted the account and seized its ownership on every
 * read — a GET that wrote, and the mechanism by which importing a
 * username another user tracked transferred their archive. Importing is
 * now something only this function does, and only for the caller.
 *
 * A bad username throws out of the provider here, which is the point:
 * the caller learns immediately instead of finding out later that a
 * background job gave up.
 */
export async function importAccount(
  deps: ConnectAccountDeps,
  userId: string,
  platform: Platform,
  username: string,
) {
  // The cache write lands before the upsert, so the handle's identity
  // exists before its connection — unless a still-fresh row already
  // carries it, in which case connecting costs no request at all.
  await warmProfileCache(deps, platform, username);
  const tracked = await deps.upsertTrackedAccount(userId, platform, username);
  if (tracked.lastSyncedAt === null) {
    const outcome = await deps.syncAccount(tracked.id);
    // The first archive is also the first chance to derive a book, and
    // the person is watching: waiting for a later sync would show them
    // two empty sides right after an import that clearly had games.
    // Judging follows on the next pass or an explicit /games/judge.
    await deps.ensureCandidateRepertoires(userId, { newGames: outcome.saved });
  }
  return (await deps.getTrackedAccount(tracked.id))!;
}
