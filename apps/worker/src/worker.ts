/**
 * [WORKER] — queue delivery and runtime composition only. Behaviors live in
 * the business modules under libs/; ./consumers are one-call adapters onto
 * them.
 */

import type { SyncDeps } from "@velachess/accounts";
import type { Database } from "@velachess/infra-db";
import { logger, type Logger } from "@velachess/infra-logger";
import type {
  AnalysisJobData,
  JobWithMetadata,
  PgBoss,
  SyncJobData,
  SyncQueue,
} from "@velachess/infra-queue";
import { analysisJobDataSchema, QUEUES, syncJobDataSchema } from "@velachess/infra-queue";
import type { z } from "zod";

import type { EngineDeps } from "./composition/analysis.ts";
import { consumeAnalysisJob } from "./consumers/analysis.ts";
import { consumeSyncJob } from "./consumers/accounts.ts";

const workerLogger = logger.child({ component: "worker" });

export interface WorkerDeps {
  db: Database;
  syncQueue: SyncQueue;
  /** The engine/lock bits `completeAnalysis` needs beyond what `db`
   * already derives — the consumer completes the rest per invocation via
   * `composition/analysis.ts`'s `buildAnalyzeDeps`, the same way
   * `consumers/accounts.ts` completes `ProcessSyncDeps` from `db`. */
  analyze: EngineDeps;
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

  /**
   * The payload is parsed before anything else touches it, including the
   * log line: `boss.work<T>`'s generic is an assertion, and the queue
   * holds whatever an older deploy or a hand-inserted row left there. A
   * rejected payload throws, so pg-boss owns the retry and the dead
   * letter instead of a slice being handed `undefined`.
   */
  const instrument = <J extends { id: string; data: object }>(
    queue: string,
    schema: z.ZodType<J["data"]>,
    handler: (deps: WorkerDeps, job: J) => Promise<void>,
  ) => {
    return async ([job]: J[]) => {
      const startedAt = Date.now();
      const parsed = schema.safeParse(job!.data);
      if (!parsed.success) {
        // The payload itself is not logged — it is the untrusted thing.
        log.error({ queue, jobId: job!.id }, "job payload rejected");
        throw new Error(`${queue} job ${job!.id} carries an unusable payload`);
      }
      const fields: Record<string, unknown> = { queue, jobId: job!.id, ...parsed.data };
      log.info(fields, "job start");
      try {
        await handler(deps, job!);
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
    // Metadata carries the retry count the sync job needs to know whether
    // this delivery is its last.
    boss.work(
      QUEUES.sync,
      { includeMetadata: true },
      instrument<JobWithMetadata<SyncJobData>>(
        QUEUES.sync,
        syncJobDataSchema,
        consumeSyncJob,
      ),
    ),
    boss.work<AnalysisJobData>(
      QUEUES.analysis,
      { localConcurrency: deps.analysisConcurrency ?? 1 },
      instrument(
        QUEUES.analysis,
        analysisJobDataSchema,
        (workerDeps, job: { id: string; data: AnalysisJobData }) =>
          consumeAnalysisJob(workerDeps, job.data),
      ),
    ),
  ]);
}
