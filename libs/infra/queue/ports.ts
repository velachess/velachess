/**
 * The interfaces business modules consume. Queue lifecycle concepts
 * (retry schedules, DLQ, claims, settlement) stay behind this boundary: a
 * module enqueues and reads a coarse state; pg-boss settles what it
 * delivers.
 */

import type { Database, TrackedAccount } from "@velachess/infra-db";

export interface SyncQueue {
  /** Sends the sync job under its own id, joining the caller's transaction.
   * Throws when pg-boss accepts nothing, so a job row never commits without
   * its delivery. `platform` is the job's pg-boss group, which the
   * worker's `groupConcurrency` keys on. */
  enqueue(
    dbOrTx: Database,
    job: { id: string; accountId: string; platform: TrackedAccount["platform"] },
  ): Promise<void>;
  /** Whether pg-boss may still deliver this job. False once its delivery
   * reached a terminal state, which only an operator's retry or redrive
   * revives. */
  isLive(dbOrTx: Database, jobId: string): Promise<boolean>;
}
