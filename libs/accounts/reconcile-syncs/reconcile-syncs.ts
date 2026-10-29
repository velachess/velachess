/**
 * Nothing consumes the dead-letter queue, so a job out of retries would stay
 * active with nothing running it, and `sync_jobs_one_active_per_account`
 * would hold every later sync out of the account.
 */
import type { Database, SyncJob } from "@velachess/infra-db";

import { isActiveSyncStatus } from "../sync-status.ts";

type Tx = Database;

type ListActiveSyncJobs = () => Promise<{ id: string; accountId: string }[]>;
type WithTransaction = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
type LockLatestSyncJob = (tx: Tx, accountId: string) => Promise<SyncJob | null>;
type IsSyncDeliveryLive = (tx: Tx, jobId: string) => Promise<boolean>;
type AbandonSyncJob = (tx: Tx, jobId: string) => Promise<void>;

export interface ReconcileSyncsDeps {
  listActiveSyncJobs: ListActiveSyncJobs;
  withTransaction: WithTransaction;
  lockLatestSyncJob: LockLatestSyncJob;
  isSyncDeliveryLive: IsSyncDeliveryLive;
  abandonSyncJob: AbandonSyncJob;
}

/** The same three steps a sync request takes over a dead job, so one
 * discipline closes a job however it is noticed. */
export async function reconcileSyncs(deps: ReconcileSyncsDeps): Promise<number> {
  const candidates = await deps.listActiveSyncJobs();
  let closed = 0;

  for (const candidate of candidates) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each pass holds row locks, and a sweep has no deadline worth contending for them
    const didClose = await deps.withTransaction(async (tx) => {
      const latest = await deps.lockLatestSyncJob(tx, candidate.accountId);
      // The listing is unlocked, so the row may have moved on since.
      if (!latest || latest.id !== candidate.id) return false;
      if (!isActiveSyncStatus(latest.status)) return false;
      if (await deps.isSyncDeliveryLive(tx, latest.id)) return false;

      await deps.abandonSyncJob(tx, latest.id);
      return true;
    });
    if (didClose) closed += 1;
  }

  return closed;
}
