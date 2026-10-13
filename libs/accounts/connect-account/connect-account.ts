/**
 * ConnectAccount — start tracking a chess.com/Lichess handle.
 *
 * The only place a connection is created. It confirms the handle with one
 * provider request, then creates the account and its first sync job — and
 * enqueues that job — in one transaction. The archive itself is fetched by
 * the worker, never here.
 *
 * A user tracks at most one handle per provider. Connecting a second
 * Chess.com handle while one is already tracked does not overwrite it —
 * `importAccount` answers `provider-connected` with the existing handle's
 * identity instead, before ever asking the provider about the new one.
 */
import type { AccountPlatform, FetchFn, ProfileFetch } from "@velachess/infra-platforms";
import {
  fetchChessComProfile,
  fetchLichessProfile,
  normalizeUsername,
} from "@velachess/infra-platforms";
import type {
  Database,
  ProviderSeat,
  SyncJob,
  TrackedAccount,
} from "@velachess/infra-db";

/** Database and a Drizzle transaction share this type in this codebase. */
type Tx = Database;

export type ConnectOutcome =
  | { status: "connected"; account: TrackedAccount; syncId: string | null }
  | {
      status: "provider-connected";
      existing: { id: string; platform: AccountPlatform; username: string };
    }
  | { status: "not-found" }
  | { status: "unavailable" };

type UpsertProviderProfile = (
  seat: ProviderSeat,
  fetched: Extract<ProfileFetch, { status: "fetched" }>,
) => Promise<unknown>;
/** The one account (if any) this user already has on a provider — read
 * before touching the provider, so a doomed connect never costs a request. */
type GetTrackedAccountByPlatform = (
  userId: string,
  platform: AccountPlatform,
) => Promise<TrackedAccount | null>;
type WithTransaction = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
/** Null when the user already has an account on that provider. */
type InsertTrackedAccount = (
  tx: Tx,
  userId: string,
  platform: AccountPlatform,
  username: string,
) => Promise<TrackedAccount | null>;
type CreateSyncJob = (
  tx: Tx,
  job: { userId: string; accountId: string; trigger: "connect" },
) => Promise<SyncJob | null>;
type EnqueueSync = (
  tx: Tx,
  job: { id: string; accountId: string; platform: AccountPlatform },
) => Promise<void>;
/** Connecting is how onboarding ends, so the first one that works says
 * so. Idempotent by contract: this runs on every connect. */
type MarkOnboarded = (userId: string) => Promise<void>;

export interface ConnectAccountDeps {
  upsertProviderProfile: UpsertProviderProfile;
  getTrackedAccountByPlatform: GetTrackedAccountByPlatform;
  withTransaction: WithTransaction;
  insertTrackedAccount: InsertTrackedAccount;
  createSyncJob: CreateSyncJob;
  enqueueSync: EnqueueSync;
  markOnboarded: MarkOnboarded;
  /** Composed once, at wiring time — the fixture a test harness reads
   * through instead of the network. Never varies per call. */
  fetch?: FetchFn;
}

/**
 * Start tracking a handle: confirm it exists, then create the user's
 * connection to it with its first sync scheduled.
 *
 * The confirmation is the handle's profile, asked fresh on every connect: a
 * cached profile row can record a failed ask, so it proves nothing. A 404
 * means the handle does not exist; any other failure means the provider
 * could not tell us, and no account is created either way — the caller
 * retries the connect rather than holding a connection nobody confirmed.
 * A confirmed profile is written through to the shared cache, so the
 * handle's first game review needs no provider request.
 *
 * The account, its job and the queue delivery commit together: a new
 * account always has a sync scheduled, and a failed enqueue leaves no
 * account. Reconnecting the handle already tracked schedules nothing.
 */
export async function importAccount(
  deps: ConnectAccountDeps,
  userId: string,
  platform: AccountPlatform,
  username: string,
): Promise<ConnectOutcome> {
  const existing = await deps.getTrackedAccountByPlatform(userId, platform);
  if (existing) return alreadyTracked(deps, userId, existing, username);

  const opts = deps.fetch ? { fetch: deps.fetch } : {};
  const profile =
    platform === "chess_com"
      ? await fetchChessComProfile(username, opts)
      : await fetchLichessProfile(username, opts);
  if (profile.status === "failed") {
    return { status: profile.reason === "not-found" ? "not-found" : "unavailable" };
  }
  await deps.upsertProviderProfile({ platform, username }, profile);

  const connected = await deps.withTransaction(async (tx) => {
    const account = await deps.insertTrackedAccount(tx, userId, platform, username);
    if (!account) return null;
    const job = await deps.createSyncJob(tx, {
      userId,
      accountId: account.id,
      trigger: "connect",
    });
    // `createSyncJob` answers null when an active job already holds the
    // account's slot, which a row inserted in this very transaction cannot
    // have. Thrown rather than asserted: should that invariant ever stop
    // holding — `insertTrackedAccount` returning an existing row, say —
    // this rolls the account insert back with a message that names the
    // cause, instead of a `TypeError` on the next line.
    if (!job) {
      throw new Error(`sync job for new account ${account.id} conflicted`);
    }
    await deps.enqueueSync(tx, { id: job.id, accountId: account.id, platform });
    return { account, syncId: job.id };
  });
  // A concurrent connect created the account after the check above.
  if (!connected) {
    const winner = await deps.getTrackedAccountByPlatform(userId, platform);
    if (!winner) {
      throw new Error(`tracked account for user ${userId}/${platform} vanished`);
    }
    return alreadyTracked(deps, userId, winner, username);
  }
  // Onboarding is over the moment a connection sticks — recorded on the
  // person, not inferred from what they currently have, so disconnecting
  // later does not send them back to the tour.
  await deps.markOnboarded(userId);

  return { status: "connected", ...connected };
}

/** A different handle is refused with the tracked one's identity; the same
 * handle is a no-op connect. */
async function alreadyTracked(
  deps: ConnectAccountDeps,
  userId: string,
  existing: TrackedAccount,
  username: string,
): Promise<ConnectOutcome> {
  if (existing.username !== normalizeUsername(username)) {
    return {
      status: "provider-connected",
      existing: {
        id: existing.id,
        platform: existing.platform,
        username: existing.username,
      },
    };
  }
  await deps.markOnboarded(userId);
  return { status: "connected", account: existing, syncId: null };
}
