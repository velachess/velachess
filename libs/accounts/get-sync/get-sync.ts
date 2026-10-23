/** Someone else's job id reads as absent, like one that never existed. */
import type { SyncJob } from "@velachess/infra-db";
import { isActiveSyncStatus } from "../sync-status.ts";

type GetSyncJobForUser = (userId: string, id: string) => Promise<SyncJob | null>;
type IsSyncDeliveryLive = (jobId: string) => Promise<boolean>;
type AbandonSyncJob = (jobId: string) => Promise<void>;

export interface GetSyncDeps {
  getSyncJobForUser: GetSyncJobForUser;
  isSyncDeliveryLive: IsSyncDeliveryLive;
  abandonSyncJob: AbandonSyncJob;
}

export async function getSync(deps: GetSyncDeps, userId: string, id: string) {
  let job = await deps.getSyncJobForUser(userId, id);
  if (!job) return null;
  // A delivery pg-boss ended without the worker recording it leaves the job
  // active with nothing running it. Only an operator's retry revives that
  // state, and a revived delivery of a closed job does nothing.
  if (isActiveSyncStatus(job.status) && !(await deps.isSyncDeliveryLive(job.id))) {
    await deps.abandonSyncJob(job.id);
    // Gone if the account was disconnected meanwhile.
    job = await deps.getSyncJobForUser(userId, id);
    if (!job) return null;
  }
  // Only a vanished handle is permanent.
  const error = job.errorCode && {
    code: job.errorCode,
    retryable: job.errorCode !== "not-found",
  };
  return { ...job, error };
}
