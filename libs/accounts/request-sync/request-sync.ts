/**
 * Records a sync job and hands it to the queue in one transaction, so a job
 * row never exists without its delivery or the other way round. One active
 * job per account, so a repeat request gets the one already running, before
 * any cooldown is considered.
 */
import type { Database, SyncJob } from "@velachess/infra-db";
import type { AccountPlatform } from "@velachess/infra-platforms";
import { isActiveSyncStatus } from "../sync-status.ts";

type Tx = Database;
type Trigger = "connect" | "manual";

type GetTrackedAccountForUser = (
  userId: string,
  accountId: string,
) => Promise<{ id: string; platform: AccountPlatform } | null>;
type WithTransaction = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
type LockLatestSyncJob = (tx: Tx, accountId: string) => Promise<SyncJob | null>;
type IsSyncDeliveryLive = (tx: Tx, jobId: string) => Promise<boolean>;
type AbandonSyncJob = (tx: Tx, jobId: string) => Promise<void>;
type CreateSyncJob = (
  tx: Tx,
  job: { userId: string; accountId: string; trigger: Trigger },
) => Promise<SyncJob | null>;
type EnqueueSync = (
  tx: Tx,
  job: { id: string; accountId: string; platform: AccountPlatform },
) => Promise<void>;

export interface RequestSyncDeps {
  getTrackedAccountForUser: GetTrackedAccountForUser;
  withTransaction: WithTransaction;
  lockLatestSyncJob: LockLatestSyncJob;
  isSyncDeliveryLive: IsSyncDeliveryLive;
  abandonSyncJob: AbandonSyncJob;
  createSyncJob: CreateSyncJob;
  enqueueSync: EnqueueSync;
}

/**
 * Counted from the account's last job. Both platforms answer 429 to bursts,
 * and a refresh button is the control someone taps twice.
 */
const SYNC_COOLDOWN_SECONDS = 60;

export type RequestSyncOutcome =
  | { status: "accepted"; job: SyncJob }
  | { status: "too-soon"; retryAfterSeconds: number }
  | { status: "not-found" };

export async function requestSync(
  deps: RequestSyncDeps,
  userId: string,
  accountId: string,
): Promise<RequestSyncOutcome> {
  // Someone else's account answers not-found, like one that never
  // existed.
  const account = await deps.getTrackedAccountForUser(userId, accountId);
  if (!account) return { status: "not-found" };

  return deps.withTransaction(async (tx) => {
    const latest = await deps.lockLatestSyncJob(tx, accountId);

    if (latest && isActiveSyncStatus(latest.status)) {
      if (await deps.isSyncDeliveryLive(tx, latest.id)) {
        return { status: "accepted", job: latest };
      }
      // pg-boss finished the delivery without the worker recording it. Only
      // an operator's retry revives that state, and a revived delivery of a
      // closed job does nothing, so this cannot race one.
      await deps.abandonSyncJob(tx, latest.id);
    } else if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      const retryAfterSeconds = Math.ceil(SYNC_COOLDOWN_SECONDS - elapsed);
      if (retryAfterSeconds > 0) return { status: "too-soon", retryAfterSeconds };
    }

    const job = await deps.createSyncJob(tx, { userId, accountId, trigger: "manual" });
    if (job) {
      await deps.enqueueSync(tx, { id: job.id, accountId, platform: account.platform });
      return { status: "accepted", job };
    }
    // A concurrent request won the insert, and this one waited for that
    // commit, so the row is there unless a disconnect took it in the same
    // instant — which no outcome here describes.
    const shared = await deps.lockLatestSyncJob(tx, accountId);
    if (!shared)
      throw new Error(`sync job for account ${accountId} vanished mid-request`);
    return { status: "accepted", job: shared };
  });
}
