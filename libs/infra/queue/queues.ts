/**
 * The topology: what queues exist, what rides on them, and the delivery
 * policy each is created with.
 *
 * This is a contract between two deployables, which is why it lives here
 * and not in apps/worker. The api sends and reads state; the worker
 * consumes; neither may import the other, and both bootstrap the topology
 * at start so either can boot alone (createQueue is idempotent).
 *
 * What is NOT here, and must never arrive: handlers, registration
 * (`boss.work`) and consumer concurrency. Those are the worker's — they
 * live in apps/worker/src/worker.ts, and __tests__/architecture.test.ts fails
 * the build if they drift back into a library.
 */

import type { PgBoss } from "./client.ts";

export const QUEUES = {
  analysis: "analysis",
  analysisDlq: "analysis-dlq",
  sync: "sync",
  syncDlq: "sync-dlq",
} as const;

export interface AnalysisJobData {
  gameId: string;
}

export interface SyncJobData {
  accountId: string;
}

/**
 * Policy "stately": at most one queued-or-active job per singleton key,
 * which is the delivery-level dedup (execution-level dedup is the
 * advisory lock in application — two layers, two different concerns).
 *
 * Accepted stately caveat, straight from pg-boss's docs: when a job with
 * the same singleton key already sits in retry state, another failing job
 * can skip its remaining retries and land in failed directly. We keep
 * stately anyway because delivery state is not domain truth here — a
 * failed delivery surfaces as 409 on the interactive route, and recovery
 * is a fresh enqueue (or pg-boss redrive), which stately permits once
 * nothing is queued or active.
 *
 * The numbers are sized by the *consumer*, and read as its constraints:
 *
 * - `retryLimit` 5 with backoff (5,10,20,40,80s ≈ 2.6min cumulative) IS
 *   the wait for a concurrently-running execution — the analysis consumer
 *   reports "still-running" and never polls inside the handler.
 * - `expireInSeconds` is the hard cap per attempt, sized for an engine
 *   run; sync needs a fraction of it.
 * - `heartbeatSeconds` lets pg-boss's monitor fail-and-retry a job whose
 *   worker died mid-run. `boss.work()` refreshes heartbeats for active
 *   jobs on its own — no handler cooperation needed.
 *
 * They are declared here rather than in apps/worker because the producer
 * creates these queues too, and a queue whose policy depends on who
 * booted first is a race, not a configuration.
 */
const POLICY = {
  analysis: {
    policy: "stately",
    retryLimit: 5,
    retryDelay: 5,
    retryBackoff: true,
    deadLetter: QUEUES.analysisDlq,
    expireInSeconds: 900,
    heartbeatSeconds: 30,
  },
  sync: {
    policy: "stately",
    retryLimit: 2,
    retryDelay: 5,
    retryBackoff: true,
    deadLetter: QUEUES.syncDlq,
    expireInSeconds: 300,
    heartbeatSeconds: 30,
  },
} as const;

/** Idempotent topology bootstrap — every process that touches the queue
 * runs it at start, producer and consumer alike. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.analysisDlq);
  await boss.createQueue(QUEUES.syncDlq);
  await boss.createQueue(QUEUES.analysis, POLICY.analysis);
  await boss.createQueue(QUEUES.sync, POLICY.sync);

  // Warm pg-boss's send path per queue. Without this, the FIRST send does
  // an own-connection queue lookup — which deadlocks on single-connection
  // backends (PGlite) when that first send happens inside a caller
  // transaction holding the connection. getQueue() does NOT warm the send
  // cache (verified empirically); a real send does. The warm job is
  // deleted immediately and uses a reserved key no domain id collides with.
  for (const name of Object.values(QUEUES)) {
    // Concurrent sends here race the single-connection deadlock above.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const warmId = await boss.send(name, {}, { singletonKey: "__warmup__" });
    // oxlint-disable-next-line eslint/no-await-in-loop
    if (warmId) await boss.deleteJob(name, warmId);
  }
}
