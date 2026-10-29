import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../client.ts";
import { syncJobs } from "../schema.ts";

type SyncJobRow = typeof syncJobs.$inferSelect;

/**
 * `@velachess/accounts`' `isActiveSyncStatus`, written again because this
 * one runs inside Postgres and infra may not import a business module. A
 * literal spelled exactly as the `sync_jobs_one_active_per_account` index
 * predicate, which Postgres matches `createSyncJob`'s conflict target
 * against to infer the arbiter; `tests/sync-jobs.test.ts` holds it to the
 * list.
 */
const ACTIVE = sql`${syncJobs.status} in ('queued', 'running', 'retrying')`;

/**
 * One spelling for every process: the worker and the API's abandon path
 * notify, the API listens. The payload is a job id to go read, never a fact
 * to act on — the notification is not durable and proves no ownership.
 */
export const SYNC_JOB_CHANGED_CHANNEL = "sync_job_changed";

/** Queued on the caller's transaction, so Postgres delivers it only once
 * the settlement and its games are visible. */
function notifySyncJobChanged(tx: Database, id: string) {
  return tx.execute(sql`select pg_notify(${SYNC_JOB_CHANGED_CHANNEL}, ${id})`);
}

/**
 * Row-locked until the caller's transaction ends. An active job is always
 * the newest one, since none can be created beside it, so this one read
 * answers both whether one is active and when the last started.
 */
export async function lockLatestSyncJob(tx: Database, accountId: string) {
  const [job] = await tx
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.accountId, accountId))
    .orderBy(desc(syncJobs.createdAt))
    .limit(1)
    .for("update");
  return job ?? null;
}

/**
 * Every account's active job, for the worker's reconciliation pass.
 * Unscoped by user: a sweep closes rows nobody is looking at.
 */
export async function listActiveSyncJobs(db: Database) {
  return db
    .select({ id: syncJobs.id, accountId: syncJobs.accountId })
    .from(syncJobs)
    .where(ACTIVE);
}

/**
 * The partial unique index is the arbiter: a concurrent trigger's insert
 * waits for this one to commit, then does nothing and gets null back.
 */
export async function createSyncJob(
  tx: Database,
  job: { userId: string; accountId: string; trigger: SyncJobRow["trigger"] },
) {
  const [row] = await tx
    .insert(syncJobs)
    .values(job)
    .onConflictDoNothing({ target: syncJobs.accountId, where: ACTIVE })
    .returning();
  return row ?? null;
}

/**
 * Closes a job pg-boss finished without the worker recording it, keeping
 * the reason the last attempt left, so a pass that ran out of retries on
 * `incomplete` reads as that.
 */
export async function abandonSyncJob(tx: Database, id: string): Promise<void> {
  const [closed] = await tx
    .update(syncJobs)
    .set({
      status: "failed",
      errorCode: sql`coalesce(${syncJobs.errorCode}, 'internal')`,
      finishedAt: new Date(),
    })
    .where(and(eq(syncJobs.id, id), ACTIVE))
    .returning({ id: syncJobs.id });
  if (closed) await notifySyncJobChanged(tx, closed.id);
}

/**
 * `started_at` becomes this delivery's claim on the row. Any active status
 * qualifies: pg-boss re-delivers only after the previous delivery lost the
 * job, and the new stamp is what makes its writes miss (`ownedBy`).
 */
export async function markSyncRunning(db: Database, id: string) {
  const [job] = await db
    .update(syncJobs)
    .set({ status: "running", errorCode: null, startedAt: new Date() })
    .where(and(eq(syncJobs.id, id), ACTIVE))
    .returning({ accountId: syncJobs.accountId, startedAt: syncJobs.startedAt });
  return job?.startedAt ? { accountId: job.accountId, startedAt: job.startedAt } : null;
}

/** The row, as long as it still carries this attempt's stamp. */
const ownedBy = (attempt: { id: string; startedAt: Date }) =>
  and(eq(syncJobs.id, attempt.id), eq(syncJobs.startedAt, attempt.startedAt));

/**
 * Locked in the order disconnecting takes its locks. False when the row
 * went with its account, or a newer delivery re-stamped it.
 */
export async function claimSyncAttempt(
  tx: Database,
  attempt: { id: string; startedAt: Date },
): Promise<boolean> {
  const rows = await tx
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(ownedBy(attempt))
    .for("update");
  return rows.length > 0;
}

/**
 * `gamesInserted` adds to earlier passes, since a partial pass keeps its
 * saves and the retry inserts only the rest. `gamesFetched` is the latest
 * pass alone, because every pass fetches the whole window again.
 */
export async function finishSyncJob(
  tx: Database,
  attempt: { id: string; startedAt: Date },
  outcome: {
    status: "succeeded" | "retrying" | "failed";
    errorCode: SyncJobRow["errorCode"];
    gamesFetched?: number;
    gamesInserted?: number;
  },
): Promise<void> {
  const { gamesInserted, ...rest } = outcome;
  const [settled] = await tx
    .update(syncJobs)
    .set({
      ...rest,
      ...(gamesInserted === undefined
        ? {}
        : {
            gamesInserted: sql`coalesce(${syncJobs.gamesInserted}, 0) + ${gamesInserted}`,
          }),
      finishedAt: outcome.status === "retrying" ? null : new Date(),
    })
    .where(ownedBy(attempt))
    .returning({ id: syncJobs.id });
  // A retry is not news, and an obsolete attempt updated nothing.
  if (settled && outcome.status !== "retrying")
    await notifySyncJobChanged(tx, settled.id);
}

/**
 * Unscoped: the API checks `userId` against the listening session, so the
 * notification payload never has to be trusted.
 */
export async function getSyncJobSettlement(db: Database, id: string) {
  const [job] = await db
    .select({
      id: syncJobs.id,
      userId: syncJobs.userId,
      accountId: syncJobs.accountId,
      status: syncJobs.status,
      gamesInserted: syncJobs.gamesInserted,
    })
    .from(syncJobs)
    .where(eq(syncJobs.id, id));
  return job ?? null;
}

export async function getSyncJobForUser(db: Database, userId: string, id: string) {
  const [job] = await db
    .select()
    .from(syncJobs)
    .where(and(eq(syncJobs.id, id), eq(syncJobs.userId, userId)));
  return job ?? null;
}
