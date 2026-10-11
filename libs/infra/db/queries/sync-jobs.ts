import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../client.ts";
import { syncJobs } from "../schema.ts";

type SyncJobRow = typeof syncJobs.$inferSelect;

const ACTIVE_STATUSES: SyncJobRow["status"][] = ["queued", "running", "retrying"];

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
    .onConflictDoNothing({
      target: syncJobs.accountId,
      // Literal, not parameters: Postgres matches it against the index
      // predicate to infer the arbiter.
      where: sql`${syncJobs.status} in ('queued', 'running', 'retrying')`,
    })
    .returning();
  return row ?? null;
}

/** Closes an active job whose delivery pg-boss already finished without it. */
export async function abandonSyncJob(tx: Database, id: string): Promise<void> {
  await tx
    .update(syncJobs)
    .set({ status: "failed", errorCode: "internal", finishedAt: new Date() })
    .where(and(eq(syncJobs.id, id), inArray(syncJobs.status, ACTIVE_STATUSES)));
}

/**
 * Marks the job running for the delivery that picked it up. Any active
 * status qualifies: pg-boss hands a job out again only after the previous
 * delivery lost it.
 */
export async function markSyncRunning(db: Database, id: string) {
  const [job] = await db
    .update(syncJobs)
    .set({ status: "running", errorCode: null, startedAt: new Date() })
    .where(and(eq(syncJobs.id, id), inArray(syncJobs.status, ACTIVE_STATUSES)))
    .returning({ accountId: syncJobs.accountId });
  return job ?? null;
}

/**
 * Locks the job before a delivery's other writes, in the order disconnecting
 * takes its locks. False when the job is gone with its account — the caller
 * then writes nothing. Whether the delivery may write at all is pg-boss's
 * fenced settle, in the same transaction.
 */
export async function lockSyncJob(tx: Database, id: string): Promise<boolean> {
  const rows = await tx
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(eq(syncJobs.id, id))
    .for("update");
  return rows.length > 0;
}

/**
 * Records how a delivery ended, on the row `lockSyncJob` locked.
 * `gamesInserted` adds to earlier passes: a partial pass keeps its saves, so
 * the retry that completes inserts only the rest. `gamesFetched` is the
 * latest pass alone, since every pass fetches the whole window again.
 */
export async function finishSyncJob(
  tx: Database,
  id: string,
  outcome: {
    status: "succeeded" | "retrying" | "failed";
    errorCode: SyncJobRow["errorCode"];
    gamesFetched?: number;
    gamesInserted?: number;
  },
): Promise<void> {
  const { gamesInserted, ...rest } = outcome;
  await tx
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
    .where(eq(syncJobs.id, id));
}

/** Owner-scoped, like every HTTP read: someone else's job reads as absent. */
export async function getSyncJobForUser(db: Database, userId: string, id: string) {
  const [job] = await db
    .select()
    .from(syncJobs)
    .where(and(eq(syncJobs.id, id), eq(syncJobs.userId, userId)));
  return job ?? null;
}
