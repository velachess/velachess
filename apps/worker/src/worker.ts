/**
 * [WORKER] — queue delivery and runtime composition only. Behaviors live in
 * libs/application; ./consumers are one-call adapters onto them.
 */

import type { AnalyzeDeps } from "@velachess/application/analysis/process-analysis/process-analysis";
import type { SyncDeps } from "@velachess/application/accounts/sync-account/sync-account";
import type { Database } from "@velachess/db";
import { logger, type Logger } from "@velachess/logger";
import type {
  AnalysisJobData,
  AnalysisQueue,
  PgBoss,
  SyncJobData,
} from "@velachess/queue";
import { QUEUES } from "@velachess/queue";

import { consumeAnalysisJob } from "./consumers/analysis.ts";
import { consumeSyncJob } from "./consumers/accounts.ts";

const workerLogger = logger.child({ component: "worker" });

export interface WorkerDeps {
  db: Database;
  analyze: AnalyzeDeps;
  analysisQueue: AnalysisQueue;
  sync?: SyncDeps;
  log?: Logger;
  /** Parallel engine runs (pg-boss localConcurrency on the analysis
   * queue). Each run owns its own engine session; stately dedup already
   * guarantees distinct games. Default 1. */
  analysisConcurrency?: number;
}

/** Registration is awaited — startup fails loudly if a worker cannot
 * register instead of logging "consuming" over a dead consumer. */
export async function registerConsumers(
  boss: PgBoss,
  deps: WorkerDeps,
): Promise<string[]> {
  const log = deps.log ?? workerLogger;

  const instrument = <T extends { gameId?: string; accountId?: string }>(
    queue: string,
    handler: (deps: WorkerDeps, data: T) => Promise<void>,
  ) => {
    return async ([job]: { id: string; data: T }[]) => {
      const startedAt = Date.now();
      const fields: Record<string, unknown> = { queue, jobId: job!.id, ...job!.data };
      log.info(fields, "job start");
      try {
        await handler(deps, job!.data);
        log.info({ ...fields, ms: Date.now() - startedAt }, "job done");
      } catch (error) {
        log.error(
          {
            err: error,
            ...fields,
            ms: Date.now() - startedAt,
          },
          "job failed",
        );
        throw error; // pg-boss owns retry → DLQ
      }
    };
  };

  // No DLQ consumers on purpose: consuming a dead letter completes it and
  // destroys the redrive option. Dead jobs stay queryable (pgboss.job) and
  // observable operationally; alerting reads state, it doesn't eat jobs.
  return Promise.all([
    boss.work<SyncJobData>(QUEUES.sync, instrument(QUEUES.sync, consumeSyncJob)),
    boss.work<AnalysisJobData>(
      QUEUES.analysis,
      { localConcurrency: deps.analysisConcurrency ?? 1 },
      instrument(QUEUES.analysis, consumeAnalysisJob),
    ),
  ]);
}
