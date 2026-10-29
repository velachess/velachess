/**
 * A user tracks at most one handle per provider: connecting a second one
 * answers `provider-connected` with the tracked handle's identity rather
 * than overwriting it.
 */
import type { AccountPlatform, FetchFn } from "@velachess/infra-platforms";
import { normalizeUsername, verifyAccountExists } from "@velachess/infra-platforms";
import type { Database, SyncJob, TrackedAccount } from "@velachess/infra-db";

type Tx = Database;

export type ConnectOutcome =
  | { status: "connected"; account: TrackedAccount; syncId: string | null }
  | {
      status: "provider-connected";
      existing: { id: string; platform: AccountPlatform; username: string };
    }
  | { status: "not-found" }
  | { status: "unavailable" };

/** Read before touching the provider, so a doomed connect costs no
 * request. */
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
/** Idempotent by contract: this runs on every connect. */
type MarkOnboarded = (userId: string) => Promise<void>;

export interface ConnectAccountDeps {
  getTrackedAccountByPlatform: GetTrackedAccountByPlatform;
  withTransaction: WithTransaction;
  insertTrackedAccount: InsertTrackedAccount;
  createSyncJob: CreateSyncJob;
  enqueueSync: EnqueueSync;
  markOnboarded: MarkOnboarded;
  /** Composed once at wiring time; never varies per call. */
  fetch?: FetchFn;
}

/**
 * No account is created unless the provider confirms the handle exists.
 *
 * The account, its job and the queue delivery commit together: a new
 * account always has a sync scheduled, and a failed enqueue leaves no
 * account.
 */
export async function importAccount(
  deps: ConnectAccountDeps,
  userId: string,
  platform: AccountPlatform,
  username: string,
): Promise<ConnectOutcome> {
  const existing = await deps.getTrackedAccountByPlatform(userId, platform);
  if (existing) return alreadyTracked(deps, userId, existing, username);

  const checked = await verifyAccountExists(
    platform,
    username,
    deps.fetch ? { fetch: deps.fetch } : {},
  );
  if (checked.status === "failed") {
    return { status: checked.reason === "not-found" ? "not-found" : "unavailable" };
  }

  const connected = await deps.withTransaction(async (tx) => {
    const account = await deps.insertTrackedAccount(tx, userId, platform, username);
    if (!account) return null;
    const job = await deps.createSyncJob(tx, {
      userId,
      accountId: account.id,
      trigger: "connect",
    });
    // Null means an active job already holds the account's slot, which a row
    // inserted in this transaction cannot have. Throwing rolls the insert
    // back and names the cause, should that ever stop holding.
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
  // Recorded on the person rather than inferred from what they have, so
  // disconnecting later does not send them back to the tour.
  await deps.markOnboarded(userId);

  return { status: "connected", ...connected };
}

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
