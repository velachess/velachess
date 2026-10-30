import type {
  AccountPlatform,
  ChessComCursor,
  LichessCursor,
} from "@velachess/infra-platforms";
import { normalizeUsername } from "@velachess/infra-platforms";
import { and, asc, desc, eq } from "drizzle-orm";

import type { Database } from "../client.ts";
import { games, syncJobs, trackedAccounts } from "../schema.ts";

type Cursor = ChessComCursor | LichessCursor;

/**
 * The `(user_id, platform)` conflict key settles two connects racing past
 * `connect-account`'s check: the loser inserts nothing and gets null back,
 * never overwriting the winner's handle.
 */
export async function insertTrackedAccount(
  db: Database,
  userId: string,
  platform: AccountPlatform,
  username: string,
) {
  const [account] = await db
    .insert(trackedAccounts)
    .values({ userId, platform, username: normalizeUsername(username) })
    .onConflictDoNothing({ target: [trackedAccounts.userId, trackedAccounts.platform] })
    .returning();
  return account ?? null;
}

/**
 * Read before `insertTrackedAccount`, so a different-handle conflict is
 * refused with the existing account's identity rather than overwritten.
 */
export async function findTrackedAccountByPlatform(
  db: Database,
  userId: string,
  platform: AccountPlatform,
) {
  const [account] = await db
    .select()
    .from(trackedAccounts)
    .where(
      and(eq(trackedAccounts.userId, userId), eq(trackedAccounts.platform, platform)),
    );
  return account ?? null;
}

/**
 * The games go explicitly, not through the `ON DELETE SET NULL` FK:
 * `perspective.ts` derives which seat the user played by joining that very
 * account, so an orphaned game would draw as if they were always White.
 * Scoped by `account_id`, so a pasted PGN and the other provider stay.
 */
export async function deleteTrackedAccountAndGames(
  db: Database,
  accountId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Job, then account — the order every sync writer takes them. Taking
    // the account first deadlocked against a sync mid-commit.
    await tx
      .select({ id: syncJobs.id })
      .from(syncJobs)
      .where(eq(syncJobs.accountId, accountId))
      .for("update");
    // An in-flight sync insert holds a key-share lock on the account
    // through its FK check, so this waits for it and the delete below sees
    // its games. Without it, a game committed between the two deletes
    // survived with account_id nulled.
    await tx
      .select({ id: trackedAccounts.id })
      .from(trackedAccounts)
      .where(eq(trackedAccounts.id, accountId))
      .for("update");
    await tx.delete(games).where(eq(games.accountId, accountId));
    await tx.delete(trackedAccounts).where(eq(trackedAccounts.id, accountId));
  });
}

export async function updateTrackedAccountCursor(
  db: Database,
  accountId: string,
  cursor: Cursor,
): Promise<void> {
  await db
    .update(trackedAccounts)
    .set({ syncCursor: cursor })
    .where(eq(trackedAccounts.id, accountId));
}

/**
 * Separate from the cursor write: an empty archive completes a pass but
 * produces no cursor, and writing them together made it look unsynced.
 */
export async function markTrackedAccountSynced(
  db: Database,
  accountId: string,
): Promise<void> {
  await db
    .update(trackedAccounts)
    .set({ lastSyncedAt: new Date() })
    .where(eq(trackedAccounts.id, accountId));
}

/**
 * Unscoped, for the worker: it holds no session and resolves ownership from
 * the row. HTTP handlers use `getTrackedAccountForUser`.
 */
export async function getTrackedAccount(db: Database, accountId: string) {
  const [account] = await db
    .select()
    .from(trackedAccounts)
    .where(eq(trackedAccounts.id, accountId));
  return account ?? null;
}

/**
 * "Not yours" and "not there" are the same null: telling them apart would
 * say which uuids exist.
 */
export async function getTrackedAccountForUser(
  db: Database,
  userId: string,
  accountId: string,
) {
  const [account] = await db
    .select()
    .from(trackedAccounts)
    .where(and(eq(trackedAccounts.id, accountId), eq(trackedAccounts.userId, userId)));
  return account ?? null;
}

/**
 * `lastSyncedAt` is how a caller tells "connected, nothing synced yet" from
 * a finished pass.
 */
export async function listTrackedAccountsByUser(db: Database, userId: string) {
  const latestJob = db
    .selectDistinctOn([syncJobs.accountId], {
      accountId: syncJobs.accountId,
      status: syncJobs.status,
      errorCode: syncJobs.errorCode,
    })
    .from(syncJobs)
    .where(eq(syncJobs.userId, userId))
    .orderBy(syncJobs.accountId, desc(syncJobs.createdAt))
    .as("latest_job");

  return db
    .select({
      id: trackedAccounts.id,
      platform: trackedAccounts.platform,
      username: trackedAccounts.username,
      lastSyncedAt: trackedAccounts.lastSyncedAt,
      latestJobStatus: latestJob.status,
      latestJobError: latestJob.errorCode,
    })
    .from(trackedAccounts)
    .leftJoin(latestJob, eq(latestJob.accountId, trackedAccounts.id))
    .where(eq(trackedAccounts.userId, userId))
    .orderBy(asc(trackedAccounts.createdAt));
}

export async function findTrackedAccount(
  db: Database,
  userId: string,
  platform: AccountPlatform,
  username: string,
) {
  const [account] = await db
    .select()
    .from(trackedAccounts)
    .where(
      and(
        eq(trackedAccounts.userId, userId),
        eq(trackedAccounts.platform, platform),
        eq(trackedAccounts.username, normalizeUsername(username)),
      ),
    );
  return account ?? null;
}
