/**
 * The interfaces business modules consume. Queue lifecycle concepts
 * (retry schedules, DLQ, claims, settlement) stay behind this boundary: a
 * module enqueues and reads a coarse state; pg-boss settles what it
 * delivers.
 */

import type { Database } from "@velachess/infra-db";

export type QueueJobState = "queued" | "active" | "failed" | "none";

export interface AnalysisQueue {
  /** dbOrTx: the repo's Database type — a Drizzle transaction is
   * structurally compatible, so enqueueing joins the caller's transaction
   * without any infra type leaking into the business module. */
  enqueue(dbOrTx: Database, gameId: string): Promise<void>;
  /** State of the newest NON-completed job for this game's singleton key.
   * Completed history is ignored on purpose: domain success lives in
   * game_analyses, never in pg-boss job history. */
  getState(gameId: string): Promise<QueueJobState>;
}

export interface SyncQueue {
  /** Sends the sync job under its own id, joining the caller's transaction.
   * Throws when pg-boss accepts nothing, so a job row never commits without
   * its delivery. */
  enqueue(dbOrTx: Database, job: { id: string; accountId: string }): Promise<void>;
  /** Whether pg-boss may still deliver this job. False once its delivery
   * reached a terminal state, which only an operator's retry or redrive
   * revives. */
  isLive(dbOrTx: Database, jobId: string): Promise<boolean>;
}
