import type { Database } from "@velachess/infra-db";
import { and, desc, eq, ne, sql as drizzleSql } from "drizzle-orm";
import { jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import { fromDrizzle, type DrizzleTransactionLike } from "pg-boss";

import type { PgBoss } from "./client.ts";
import type { AnalysisQueue, QueueJobState, SyncQueue } from "./ports.ts";
import { QUEUES } from "./queues.ts";

/** pg-boss's own table, declared for typed reads — the adapter is the
 * pg-boss boundary, so knowing its schema here is the point, not a leak. */
const pgboss = pgSchema("pgboss");
const bossJob = pgboss.table("job", {
  id: text("id"),
  name: text("name"),
  state: text("state"),
  singletonKey: text("singleton_key"),
  data: jsonb("data"),
  createdOn: timestamp("created_on", { withTimezone: true }),
});

/** pg-boss may still deliver a job in these states. It leaves the others
 * only through an operator's retry, resume or redrive. */
const LIVE_STATES = new Set(["created", "retry", "active"]);

function toPortState(state: string | null | undefined): QueueJobState {
  if (state === undefined || state === null) return "none";
  if (state === "created" || state === "retry") return "queued";
  if (state === "active") return "active";
  if (state === "failed" || state === "cancelled") return "failed";
  return "none";
}

/** Newest non-completed job for the singleton key. Completed history is
 * excluded by design — domain success lives in game_analyses. */
async function singletonState(
  db: Database,
  queue: string,
  key: string,
): Promise<QueueJobState> {
  const [row] = await db
    .select({ state: bossJob.state })
    .from(bossJob)
    .where(
      and(
        eq(bossJob.name, queue),
        eq(bossJob.singletonKey, key),
        ne(bossJob.state, "completed"),
      ),
    )
    .orderBy(desc(bossJob.createdOn))
    .limit(1);
  return toPortState(row?.state);
}

/**
 * drizzle types `execute()` as returning `unknown`; pg-boss's adapter wants
 * the concrete `{ rows }` shape it gets at runtime. Bridging that is what
 * this file is for — the assertion stays here, at the pg-boss boundary,
 * and never leaks into callers.
 */
const asBossDb = (dbOrTx: Database) =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- drizzle's execute() types as unknown; bridged once, at this boundary
  fromDrizzle(dbOrTx as DrizzleTransactionLike, drizzleSql);

export function makeAnalysisQueue(boss: PgBoss, db: Database): AnalysisQueue {
  return {
    async enqueue(dbOrTx: Database, gameId: string): Promise<void> {
      await boss.send(
        QUEUES.analysis,
        { gameId },
        { singletonKey: gameId, db: asBossDb(dbOrTx) },
      );
    },
    getState(gameId: string): Promise<QueueJobState> {
      return singletonState(db, QUEUES.analysis, gameId);
    },
  };
}

export function makeSyncQueue(boss: PgBoss): SyncQueue {
  return {
    async enqueue(dbOrTx, job) {
      // No payload: the job id is the sync job's id, the account is its
      // singleton key, and the worker reads everything else from the row.
      const sent = await boss.send(
        QUEUES.sync,
        {},
        { id: job.id, singletonKey: job.accountId, db: asBossDb(dbOrTx) },
      );
      if (!sent) throw new Error(`sync job ${job.id} was not enqueued`);
    },
    async isLive(dbOrTx, jobId) {
      const [row] = await dbOrTx
        .select({ state: bossJob.state })
        .from(bossJob)
        .where(and(eq(bossJob.name, QUEUES.sync), eq(bossJob.id, jobId)));
      return row !== undefined && LIVE_STATES.has(row.state ?? "");
    },
  };
}
