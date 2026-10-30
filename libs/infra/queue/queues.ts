/**
 * See docs/explanation/modules/queue.md for why this is a library and the
 * api/worker boundary it enforces.
 */

import type { PgBoss } from "./client.ts";

export const QUEUES = {
  sync: "sync",
  syncDlq: "sync-dlq",
  syncReconcile: "sync-reconcile",
} as const;

const DEFAULT_POLICY = "stately";
const DEFAULT_RETRY_LIMIT = 2;
const DEFAULT_RETRY_DELAY_SECONDS = 60;
const DEFAULT_RETRY_BACKOFF = true;
const DEFAULT_EXPIRE_IN_SECONDS = 300;
const DEFAULT_HEARTBEAT_SECONDS = 30;

const RECONCILE_EXPIRE_IN_SECONDS = 120;

/** Cron's floor, and enough: the pass is a read that closes nothing alive. */
const RECONCILE_CRON = "* * * * *";

/**
 * "stately" is the delivery-level dedup: at most one queued-or-active job
 * per singleton key. Its documented caveat — a failing job skipping its
 * remaining retries when another with the same key sits in retry state — is
 * accepted, because recovery here is a fresh enqueue, which stately permits
 * once nothing is queued or active.
 *
 * `retryDelay` is a one-minute floor because Lichess asks for a full minute
 * after a 429 and pg-boss has no per-failure delay. `heartbeatSeconds` lets
 * pg-boss's monitor fail-and-retry a job whose worker died mid-run, which
 * `boss.work()` refreshes without handler cooperation.
 *
 * Declared here rather than in apps/worker because the producer creates
 * this queue too, and a policy depending on who booted first is a race.
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
  /**
   * "exclusive" is one job queued or active: "short" caps the queued state
   * alone, so a pass slower than the cron would overlap the next, and
   * occurrences would pile up while the worker is down. The next tick is the
   * retry, so there is none.
   */
  syncReconcile: {
    policy: "exclusive",
    retryLimit: 0,
    expireInSeconds: RECONCILE_EXPIRE_IN_SECONDS,
  },
} as const;

/** Every process that touches the queue runs this at start, producer and
 * consumer alike. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUES.syncDlq);
  await boss.createQueue(QUEUES.sync, POLICY.sync);
  // createQueue does nothing for a queue that already exists, and the policy
  // (which updateQueue cannot change) is fixed at creation.
  const { policy: _policy, ...current } = POLICY.sync;
  await boss.updateQueue(QUEUES.sync, current);

  await boss.createQueue(QUEUES.syncReconcile, POLICY.syncReconcile);
  const { policy: _reconcilePolicy, ...currentReconcile } = POLICY.syncReconcile;
  await boss.updateQueue(QUEUES.syncReconcile, currentReconcile);

  // Without a warm send, the first one does an own-connection queue lookup,
  // which deadlocks on single-connection backends (PGlite) when it happens
  // inside a caller transaction holding the connection. `getQueue()` does
  // not warm that cache; a real send does.
  for (const name of Object.values(QUEUES)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- concurrent sends here race the single-connection deadlock above
    const warmId = await boss.send(name, {}, { singletonKey: "__warmup__" });
    // oxlint-disable-next-line eslint/no-await-in-loop -- must follow its own send above, per queue
    if (warmId) await boss.deleteJob(name, warmId);
  }
}

/** An upsert, so every worker that boots agrees on the one schedule row. */
export function scheduleSyncReconcile(boss: PgBoss): Promise<void> {
  return boss.schedule(QUEUES.syncReconcile, RECONCILE_CRON);
}

export async function queuesExist(boss: PgBoss) {
  const names = Object.values(QUEUES);
  return (await boss.getQueues(names)).length === names.length;
}
