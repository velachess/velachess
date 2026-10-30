/**
 * Retry schedules, dead letters, claims and settlement stay behind this
 * boundary: a module enqueues and reads a coarse state.
 */

import type { Database, TrackedAccount } from "@velachess/infra-db";

export interface SyncQueue {
  /** Joins the caller's transaction and throws when pg-boss accepts
   * nothing, so a job row never commits without its delivery. `platform` is
   * the group the worker's `groupConcurrency` keys on. */
  enqueue(
    dbOrTx: Database,
    job: { id: string; accountId: string; platform: TrackedAccount["platform"] },
  ): Promise<void>;
  /** False once the delivery reached a terminal state, which only an
   * operator's retry or redrive revives. Locks the delivery for the
   * caller's transaction, so a caller that closes the job on this answer
   * cannot be raced by a revival. */
  isLive(dbOrTx: Database, jobId: string): Promise<boolean>;
}
