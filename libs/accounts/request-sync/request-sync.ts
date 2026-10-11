/**
 * RequestSync — ask for an account's archive to be brought up to date.
 *
 * Never fetches: it records a sync job and hands it to the queue, in one
 * transaction, so a job row never exists without its delivery or the other
 * way round. One active job per account — a repeat request gets the one
 * already running, before any cooldown is considered.
 */
import type { Database, SyncJob } from "@velachess/infra-db";

/** Database and a Drizzle transaction share this type in this codebase. */
type Tx = Database;
type Trigger = "connect" | "manual";

type GetTrackedAccountForUser = (
  userId: string,
  accountId: string,
) => Promise<{ id: string } | null>;
type WithTransaction = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
type LockLatestSyncJob = (tx: Tx, accountId: string) => Promise<SyncJob | null>;
type IsSyncDeliveryLive = (tx: Tx, jobId: string) => Promise<boolean>;
type AbandonSyncJob = (tx: Tx, jobId: string) => Promise<void>;
type CreateSyncJob = (
  tx: Tx,
  job: { userId: string; accountId: string; trigger: Trigger },
) => Promise<SyncJob | null>;
type EnqueueSync = (tx: Tx, job: { id: string; accountId: string }) => Promise<void>;

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
 * How long an account rests between manual syncs, counted from its last
 * job. Both platforms answer 429 to bursts, and a refresh button is exactly
 * the control someone taps twice.
 */
const SYNC_COOLDOWN_SECONDS = 60;

export type RequestSyncOutcome =
  | { status: "accepted"; job: SyncJob }
  | { status: "too-soon"; retryAfterSeconds: number }
  | { status: "not-found" };

const ACTIVE = new Set<SyncJob["status"]>(["queued", "running", "retrying"]);

export async function requestSync(
  deps: RequestSyncDeps,
  userId: string,
  accountId: string,
): Promise<RequestSyncOutcome> {
  // Scoped by owner: someone else's account answers not-found, the same as
  // one that never existed.
  const account = await deps.getTrackedAccountForUser(userId, accountId);
  if (!account) return { status: "not-found" };

  return deps.withTransaction(async (tx) => {
    const latest = await deps.lockLatestSyncJob(tx, accountId);

    if (latest && ACTIVE.has(latest.status)) {
      if (await deps.isSyncDeliveryLive(tx, latest.id)) {
        return { status: "accepted", job: latest };
      }
      // pg-boss finished this delivery without the worker recording it (a
      // crash or a timeout on the last attempt). Only an operator's retry or
      // redrive revives that state, and a revived delivery of a closed job
      // does nothing, so closing it here cannot race a delivery.
      await deps.abandonSyncJob(tx, latest.id);
    } else if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      const retryAfterSeconds = Math.ceil(SYNC_COOLDOWN_SECONDS - elapsed);
      if (retryAfterSeconds > 0) return { status: "too-soon", retryAfterSeconds };
    }

    const job = await deps.createSyncJob(tx, { userId, accountId, trigger: "manual" });
    // A concurrent request won the insert: share its job.
    if (!job)
      return { status: "accepted", job: (await deps.lockLatestSyncJob(tx, accountId))! };
    await deps.enqueueSync(tx, { id: job.id, accountId });
    return { status: "accepted", job };
  });
}
