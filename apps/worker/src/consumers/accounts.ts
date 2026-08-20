/**
 * [CONSUMER] accounts — pg-boss delivery → the sync-account slice.
 * Unpack, invoke, let the throw drive retry → DLQ. Nothing else.
 */
import { processAccountSync } from "@velachess/application/accounts/sync-account/sync-account";
import type { SyncJobData } from "@velachess/queue";

import type { WorkerDeps } from "../worker.ts";

/** Sync → completeness → judge is ONE application use case
 * (processAccountSync); the worker never learns that judgment follows
 * sync. */
export async function consumeSyncJob(deps: WorkerDeps, data: SyncJobData): Promise<void> {
  await processAccountSync(deps.db, data.accountId, deps.analysisQueue, deps.sync ?? {});
}
