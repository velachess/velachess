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
 * Ownership is part of the conflict key — `(user_id, platform)` — so two
 * users tracking the same handle get two rows, and one user gets at most
 * one row per provider. Previously platform+username was globally unique
 * with a separate ownership UPDATE, which let an import silently steal
 * another user's archive; before that, it was `(user_id, platform,
 * username)`, which let one user track two different handles on the same
 * provider.
 *
 * The key is also what settles two connects racing past
 * `connect-account`'s check for an existing row: the loser inserts nothing
 * and gets null, never overwriting the winner's handle.
 *
 * Identity does not live here: provider metadata is public and shared,
 * so it is cached once per handle in `provider_profiles` (see
 * provider-profiles.ts), not per connection.
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
 * The one row (if any) this user has for a provider — read before
 * `insertTrackedAccount` so a different-handle conflict can be refused
 * with the existing account's identity instead of silently overwriting it.
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
 * Drops a connection and everything it brought in, in one transaction:
 * the games whose provenance is this account first, then the account
 * itself. Their analyses go with the games (`game_analyses.game_id` is
 * `ON DELETE CASCADE`).
 *
 * The games are deleted explicitly rather than left to the FK, which is
 * `ON DELETE SET NULL`: orphaned rows would survive the connection that
 * explains them, and `perspective.ts` derives which seat the user played
 * by joining that very account — a game without one draws as if the user
 * were always White. The FK stays as the backstop for a user-level
 * cascade; this path decides on purpose.
 *
 * Scoped by `account_id`, so a manually imported PGN (which has none) and
 * the user's other provider are untouched.
 */
export async function deleteTrackedAccountAndGames(
  db: Database,
  accountId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock order is job, then account — the order every sync writer takes
    // them (the job row, then the account through the games' FK). Taking
    // the account first deadlocked against a sync mid-commit.
    await tx
      .select({ id: syncJobs.id })
      .from(syncJobs)
      .where(eq(syncJobs.accountId, accountId))
      .for("update");
    // An in-flight sync insert holds a key-share lock on the account
    // through its FK check, so this waits for that insert to commit and
    // the delete below sees its games. Without it, a game committed
    // between the two deletes survived with account_id nulled.
    await tx
      .select({ id: trackedAccounts.id })
      .from(trackedAccounts)
      .where(eq(trackedAccounts.id, accountId))
      .for("update");
    await tx.delete(games).where(eq(games.accountId, accountId));
    await tx.delete(trackedAccounts).where(eq(trackedAccounts.id, accountId));
  });
}

/** Where to resume from. Advances only on a pass with nothing to retry. */
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
 * A pass finished with nothing left to retry. Kept separate from the
 * cursor write: an account with an empty archive completes a pass but
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
 * By id, unscoped — for the WORKER, which holds no session and resolves
 * ownership from the row itself (the row is trusted; a job id is not a
 * claim anyone made). HTTP handlers use `getTrackedAccountForUser`.
 */
export async function getTrackedAccount(db: Database, accountId: string) {
  const [account] = await db
    .select()
    .from(trackedAccounts)
    .where(eq(trackedAccounts.id, accountId));
  return account ?? null;
}

/**
 * By id, scoped to its owner — the HTTP shape. "Not yours" and "not
 * there" are deliberately the same null: distinguishing them would tell
 * a caller which uuids exist.
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
 * The accounts a user tracks, oldest first, each with its newest sync job.
 * `lastSyncedAt` is what tells a caller whether this account ever completed
 * a pass — the difference between "not connected" and "connected, nothing
 * synced yet".
 */
export async function listTrackedAccountsByUser(db: Database, userId: string) {
  const latestJob = db
    .selectDistinctOn([syncJobs.accountId], {
      accountId: syncJobs.accountId,
      id: syncJobs.id,
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
      latestJobId: latestJob.id,
      latestJobStatus: latestJob.status,
      latestJobError: latestJob.errorCode,
    })
    .from(trackedAccounts)
    .leftJoin(latestJob, eq(latestJob.accountId, trackedAccounts.id))
    .where(eq(trackedAccounts.userId, userId))
    .orderBy(asc(trackedAccounts.createdAt));
}

/** The user's connection to a handle, if they track it. Reads never create. */
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
