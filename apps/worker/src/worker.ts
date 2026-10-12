/**
 * [WORKER] — the two pg-boss handlers and the process lifecycle around
 * them. Behaviors live in the business modules under libs/; a handler
 * composes a slice's deps and calls it. pg-boss owns the rest: a handler
 * that returns completes its job, one that throws fails it, and the queue's
 * policy decides retry, backoff and dead letter.
 */

import { syncAccount, type SyncDeps } from "@velachess/accounts";
import { completeAnalysis } from "@velachess/analysis";
import type { Database } from "@velachess/infra-db";
import { logger, type Logger } from "@velachess/infra-logger";
import {
  analysisJobDataSchema,
  ensureQueues,
  QUEUES,
  type PgBoss,
} from "@velachess/infra-queue";

import { buildSyncAccountDeps } from "./composition/accounts.ts";
import { buildAnalyzeDeps, type EngineDeps } from "./composition/analysis.ts";

const workerLogger = logger.child({ component: "worker" });

export interface WorkerDeps {
  boss: PgBoss;
  db: Database;
  /** The engine/lock bits `completeAnalysis` needs beyond what `db`
   * already derives. */
  analyze: EngineDeps;
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

    await boss.work(QUEUES.sync, async (jobs) => {
      for (const job of jobs) {
        const fields = { queue: QUEUES.sync, jobId: job.id };
        log.info(fields, "job start");
        // oxlint-disable-next-line eslint/no-await-in-loop
        await syncAccount(buildSyncAccountDeps(db, this.#deps.sync), job).catch(
          failed(log, fields),
        );
      }
    });

    await boss.work(QUEUES.analysis, async (jobs) => {
      for (const job of jobs) {
        // The payload is parsed before anything else touches it, the log
        // line included: `boss.work<T>` is an assertion, and the queue
        // holds whatever an older deploy or a hand-inserted row left there.
        // A rejected payload throws, so pg-boss retries then dead-letters it.
        const { gameId } = analysisJobDataSchema.parse(job.data);
        const fields = { queue: QUEUES.analysis, jobId: job.id, gameId };
        log.info(fields, "job start");
        // oxlint-disable-next-line eslint/no-await-in-loop
        await completeAnalysis(buildAnalyzeDeps(db, this.#deps.analyze), gameId).catch(
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
