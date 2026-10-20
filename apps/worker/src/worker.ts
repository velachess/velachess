/**
 * [WORKER] — the sync pg-boss handler and the process lifecycle around
 * it. Behavior lives in the business modules under libs/; the handler
 * composes a slice's deps and calls it. pg-boss owns the rest: a handler
 * that returns completes its job, one that throws fails it, and the queue's
 * policy decides retry, backoff and dead letter.
 *
 * Analysis has no worker handler — it runs browser-side (Stockfish WASM),
 * not queued here. See PR #155 and docs/reference/analysis.md.
 */

import { syncAccount, type SyncDeps } from "@velachess/accounts";
import type { Database } from "@velachess/infra-db";
import { logger, type Logger } from "@velachess/infra-logger";
import { ensureQueues, QUEUES, type PgBoss } from "@velachess/infra-queue";

import { buildSyncAccountDeps } from "./composition/accounts.ts";

const workerLogger = logger.child({ component: "worker" });

export interface WorkerDeps {
  boss: PgBoss;
  db: Database;
  sync?: SyncDeps;
  log?: Logger;
}

export class Worker {
  // A plain field, not a parameter property: `main.ts` runs under Node's
  // `--experimental-strip-types`, which strips types only and rejects the
  // TypeScript-only `constructor(private deps)` shorthand.
  readonly #deps: WorkerDeps;

  constructor(deps: WorkerDeps) {
    this.#deps = deps;
  }

  /** Registration is awaited: startup fails loudly if a handler cannot
   * register instead of logging "consuming" over a dead one. `boss.start`
   * is a no-op on a boss already started (the test harness's). */
  async start(): Promise<void> {
    const { boss, db, log = workerLogger } = this.#deps;
    await boss.start();
    await ensureQueues(boss);

    // No DLQ handlers on purpose: consuming a dead letter completes it and
    // destroys the operator's options. Dead jobs stay visible in the
    // dashboard (`pnpm queue:dashboard`): a failed sync is revived by
    // *retrying* it there, which keeps its id — the sync job's id — while
    // a redrive of the DLQ copy mints a new id the slice cannot resolve.

    // Both providers ask for one request at a time. A job calls its provider
    // sequentially, so one job per provider group across every node is one
    // request in flight per provider.
    await boss.work(QUEUES.sync, { groupConcurrency: 1 }, async (jobs) => {
      for (const job of jobs) {
        const fields = { queue: QUEUES.sync, jobId: job.id };
        log.info(fields, "job start");
        // oxlint-disable-next-line eslint/no-await-in-loop -- pg-boss delivers this queue's batch one job at a time
        await syncAccount(buildSyncAccountDeps(db, this.#deps.sync), job).catch(
          failed(log, fields),
        );
      }
    });
  }

  /** In-flight jobs finish, new fetches stop. */
  stop(): Promise<void> {
    return this.#deps.boss.stop({ graceful: true });
  }
}

/** Logs the failure with the job's fields, then lets pg-boss have it. */
function failed(log: Logger, fields: Record<string, unknown>) {
  return (error: unknown): never => {
    log.error({ err: error, ...fields }, "job failed");
    throw error;
  };
}
