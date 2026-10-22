/**
 * The topology: what queues exist, what rides on them, and the delivery
 * policy each is created with. See docs/explanation/modules/queue.md for
 * why this is a library and the api/worker boundary it enforces.
 */

import type { PgBoss } from "./client.ts";

export const QUEUES = {
  sync: "sync",
  syncDlq: "sync-dlq",
} as const;

const DEFAULT_POLICY = "stately";
const DEFAULT_RETRY_LIMIT = 2;
const DEFAULT_RETRY_DELAY_SECONDS = 60;
const DEFAULT_RETRY_BACKOFF = true;
const DEFAULT_EXPIRE_IN_SECONDS = 300;
const DEFAULT_HEARTBEAT_SECONDS = 30;

/**
 * Policy "stately": at most one queued-or-active job per singleton key,
 * which is the delivery-level dedup.
 *
 * Accepted stately caveat, straight from pg-boss's docs: when a job with
 * the same singleton key already sits in retry state, another failing job
 * can skip its remaining retries and land in failed directly. We keep
 * stately anyway because delivery state is not domain truth here — recovery
 * is a fresh enqueue (or pg-boss redrive), which stately permits once
 * nothing is queued or active.
 *
 * `retryDelay` is a floor of one minute because Lichess asks for a full
 * minute after a 429 and pg-boss has no per-failure delay: every sync
 * retry waits at least that long.
 *
 * `heartbeatSeconds` lets pg-boss's monitor fail-and-retry a job whose
 * worker died mid-run. `boss.work()` refreshes heartbeats for active jobs
 * on its own — no handler cooperation needed.
 *
 * Declared here rather than in apps/worker because the producer creates
 * this queue too, and a queue whose policy depends on who booted first is
 * a race, not a configuration.
 */
const POLICY = {
  sync: {
    policy: DEFAULT_POLICY,
    retryLimit: DEFAULT_RETRY_LIMIT,
    retryDelay: DEFAULT_RETRY_DELAY_SECONDS,
    retryBackoff: DEFAULT_RETRY_BACKOFF,
    deadLetter: QUEUES.syncDlq,
    expireInSeconds: DEFAULT_EXPIRE_IN_SECONDS,
    heartbeatSeconds: DEFAULT_HEARTBEAT_SECONDS,
  },
} as const;

/** Idempotent topology bootstrap — every process that touches the queue
 * runs it at start, producer and consumer alike. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.syncDlq);
  await boss.createQueue(QUEUES.sync, POLICY.sync);
  // createQueue does nothing for a queue that already exists, and the policy
  // (which updateQueue cannot change) is fixed at creation.
  const { policy: _policy, ...current } = POLICY.sync;
  await boss.updateQueue(QUEUES.sync, current);

  // Warm pg-boss's send path per queue. Without this, the FIRST send does
  // an own-connection queue lookup — which deadlocks on single-connection
  // backends (PGlite) when that first send happens inside a caller
  // transaction holding the connection. getQueue() does NOT warm the send
  // cache (verified empirically); a real send does. The warm job is
  // deleted immediately and uses a reserved key no domain id collides with.
  for (const name of Object.values(QUEUES)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- concurrent sends here race the single-connection deadlock above
    const warmId = await boss.send(name, {}, { singletonKey: "__warmup__" });
    // oxlint-disable-next-line eslint/no-await-in-loop -- must follow its own send above, per queue
    if (warmId) await boss.deleteJob(name, warmId);
  }
}

export async function queuesExist(boss: PgBoss) {
  const names = Object.values(QUEUES);
  return (await boss.getQueues(names)).length === names.length;
}
