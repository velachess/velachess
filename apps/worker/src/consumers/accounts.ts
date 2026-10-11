/**
 * [CONSUMER] accounts — pg-boss delivery → the process-sync slice.
 * Unpack, invoke, let the throw drive retry → DLQ. Nothing else.
 */
import { processSync } from "@velachess/accounts";
import type { JobWithMetadata, SyncJobData } from "@velachess/infra-queue";

import { buildProcessSyncDeps } from "../composition/accounts.ts";
import type { WorkerDeps } from "../worker.ts";

export async function consumeSyncJob(
  deps: WorkerDeps,
  job: Pick<
    JobWithMetadata<SyncJobData>,
    "id" | "data" | "retryCount" | "retryLimit" | "signal"
  >,
): Promise<void> {
  await processSync(buildProcessSyncDeps(deps.db, deps.syncQueue, deps.sync?.fetch), {
    syncJobId: job.data.syncJobId,
    retryCount: job.retryCount,
    retryLimit: job.retryLimit,
    signal: job.signal,
  });
}
