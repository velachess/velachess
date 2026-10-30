/**
 * pg-boss owns the delivery: a handler that returns completes its job, one
 * that throws fails it, and the queue's policy decides retry, backoff and
 * dead letter.
 *
 * Analysis has no worker handler — it runs browser-side (Stockfish WASM),
 * not queued here. See PR #155 and docs/reference/analysis.md.
 */

import { reconcileSyncs, syncAccount, type SyncDeps } from "@velachess/accounts";
import type { Database } from "@velachess/infra-db";
import { logger, type Logger } from "@velachess/infra-logger";
import {
  ensureQueues,
  makeSyncQueue,
  QUEUES,
  scheduleSyncReconcile,
  type PgBoss,
} from "@velachess/infra-queue";

import { buildReconcileSyncsDeps, buildSyncAccountDeps } from "./composition/accounts.ts";

const workerLogger = logger.child({ component: "worker" });

export interface WorkerDeps {
  boss: PgBoss;
  db: Database;
  sync?: SyncDeps;
  log?: Logger;
}

export class Worker {
  // A plain field: `main.ts` runs under Node's `--experimental-strip-types`,
  // which rejects the TypeScript-only `constructor(private deps)` shorthand.
  readonly #deps: WorkerDeps;

  constructor(deps: WorkerDeps) {
    this.#deps = deps;
  }

  /** Registration is awaited, so startup fails rather than logging
   * "consuming" over a dead handler. `boss.start` is a no-op on an
   * already-started boss. */
  async start(): Promise<void> {
    const { boss, db, log = workerLogger } = this.#deps;
    await boss.start();
    await ensureQueues(boss);

    // No DLQ handler: consuming a dead letter completes it and takes away
    // the operator's retry, which keeps the sync job's id where a redrive
    // mints one the slice cannot resolve. The row it leaves active is the
    // reconciliation pass's job.
    const reconcile = async () => {
      const closed = await reconcileSyncs(
        buildReconcileSyncsDeps(db, makeSyncQueue(boss)),
      );
      if (closed > 0) log.info({ queue: QUEUES.syncReconcile, closed }, "syncs closed");
    };

    await scheduleSyncReconcile(boss);
    await boss.work(QUEUES.syncReconcile, reconcile);

    // Both providers ask for one request at a time, and a job calls its
    // provider sequentially, so one job per group across every node is one
    // request in flight per provider.
    await boss.work(QUEUES.sync, { groupConcurrency: 1 }, async (jobs) => {
      for (const job of jobs) {
        const fields = { queue: QUEUES.sync, jobId: job.id };
        log.info(fields, "job start");
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- pg-boss delivers this queue's batch one job at a time
          await syncAccount(buildSyncAccountDeps(db, this.#deps.sync), job);
        } catch (error) {
          log.error({ err: error, ...fields }, "job failed");
          throw error;
        }
      }
    });

    // A restart does not wait for the next tick.
    await reconcile();
  }

  stop(): Promise<void> {
    return this.#deps.boss.stop({ graceful: true });
  }
}
