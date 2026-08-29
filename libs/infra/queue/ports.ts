/**
 * The interfaces `libs/application` consumes. Queue lifecycle concepts
 * (retries, DLQ, claims) never cross this boundary — application sees
 * enqueue and a coarse state, nothing else.
 */

import type { Database } from "@velachess/db";

export type QueueJobState = "queued" | "active" | "failed" | "none";

export interface AnalysisQueue {
  /** dbOrTx: the repo's Database type — a Drizzle transaction is
   * structurally compatible, so enqueueing joins the caller's transaction
   * without any infra type leaking into application. */
  enqueue(dbOrTx: Database, gameId: string): Promise<void>;
  /** State of the newest NON-completed job for this game's singleton key.
   * Completed history is ignored on purpose: domain success lives in
   * game_analyses, never in pg-boss job history. */
  getState(gameId: string): Promise<QueueJobState>;
}

export interface SyncQueue {
  enqueue(dbOrTx: Database, accountId: string): Promise<void>;
  getState(accountId: string): Promise<QueueJobState>;
}
