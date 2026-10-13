import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../client.ts";
import { syncJobs } from "../schema.ts";

type SyncJobRow = typeof syncJobs.$inferSelect;

/**
 * The same rule as `@velachess/accounts`' `isActiveSyncStatus`, written a
 * second time because this one runs inside Postgres and infra may not
 * import a business module — the arrangement `libs/chess/game-result.ts`
 * documents for its own SQL counterpart. A literal, not parameters, and
 * spelled exactly as the `sync_jobs_one_active_per_account` index
 * predicate: Postgres matches `createSyncJob`'s conflict target against it
 * to infer the arbiter. `tests/sync-jobs.test.ts` holds it to the list.
 */
const ACTIVE = sql`${syncJobs.status} in ('queued', 'running', 'retrying')`;

/**
 * The channel a settled sync is announced on. One spelling for every
 * process: the worker notifies it from the transaction that settles the
 * job, the API's own abandon path too, and the API listens. The payload is
 * the job id — a hint to go read the row, never a fact to act on: the
 * notification is not durable and carries no proof of ownership.
 */
export const SYNC_JOB_CHANGED_CHANNEL = "sync_job_changed";

/** Queued on the caller's transaction, so Postgres delivers it only once
 * the settlement — and the games committed with it — is visible. */
function notifySyncJobChanged(tx: Database, id: string) {
  return tx.execute(sql`select pg_notify(${SYNC_JOB_CHANGED_CHANNEL}, ${id})`);
}

/**
 * The account's newest job, row-locked until the caller's transaction ends.
 * The only active job is always the newest one (none can be created beside
 * it), so this one read answers both "is one active?" and "when did the
 * last one start?".
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
 * Inserts the job unless the account already holds an active one. The
 * partial unique index is the arbiter: a concurrent trigger's insert waits
 * for this one to commit, then does nothing and gets null back.
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
 * Closes a job pg-boss finished without the worker recording it — a crash,
 * or the retries spent — keeping the reason the last attempt left, so a
 * pass that ran out of retries on `incomplete` reads as that.
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
 * Marks the job running for the delivery that picked it up, stamping
 * `started_at` as that delivery's claim on the row. Any active status
 * qualifies: pg-boss hands a job out again only after the previous
 * delivery lost it, and the new stamp is what makes the old one's writes
 * miss (`ownedBy`).
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
 * Claims the row for this attempt before its other writes: locked, in the
 * order disconnecting takes its locks. False when the row is gone with its
 * account (the only way a row leaves this table), or a newer delivery
 * re-stamped it — the attempt is obsolete and writes nothing.
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
 * Records how a delivery ended, on the row it still owns (`ownedBy`).
 * `gamesInserted` adds to earlier passes: a partial pass keeps its saves, so
 * the retry that completes inserts only the rest. `gamesFetched` is the
 * latest pass alone, since every pass fetches the whole window again.
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
  // A retry is not news: the job is still on its way. An obsolete attempt
  // updated nothing and announces nothing.
  if (settled && outcome.status !== "retrying")
    await notifySyncJobChanged(tx, settled.id);
}

/**
 * What a notification resolves to, unscoped: the API checks `userId`
 * against the session that is listening, so the payload never has to be
 * trusted. Null once the row went with its account.
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

/** Owner-scoped, like every HTTP read: someone else's job reads as absent. */
export async function getSyncJobForUser(db: Database, userId: string, id: string) {
  const [job] = await db
    .select()
    .from(syncJobs)
    .where(and(eq(syncJobs.id, id), eq(syncJobs.userId, userId)));
  return job ?? null;
}
