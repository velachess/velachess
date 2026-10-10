/**
 * [CONSUMER] accounts — pg-boss delivery → the sync-account slice.
 * Unpack, invoke, let the throw drive retry → DLQ. Nothing else.
 */
import { processAccountSync } from "@velachess/accounts";
import type { SyncJobData } from "@velachess/infra-queue";

import { buildSyncAccountDeps } from "../composition/accounts.ts";
import type { WorkerDeps } from "../worker.ts";

/** Sync → completeness is ONE application use case (processAccountSync). */
export async function consumeSyncJob(deps: WorkerDeps, data: SyncJobData): Promise<void> {
  const syncDeps = buildSyncAccountDeps(deps.db, deps.sync?.fetch);
  await processAccountSync(syncDeps, data.accountId);
}
