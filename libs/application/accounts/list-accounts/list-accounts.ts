/**
 * ListAccounts — every handle this user tracks, with delivery state.
 * `syncState` (not just `lastSyncedAt`) lets a client tell "still syncing" from "gave up".
 */
import { asc, eq } from "drizzle-orm";

import type { Database } from "@velachess/db";
import { schema } from "@velachess/db";
import type { SyncQueue } from "@velachess/queue/ports";

const { trackedAccounts } = schema;

/**
 * The accounts a user tracks, oldest first. `lastSyncedAt` is what tells a
 * caller whether this account ever completed a pass — the difference
 * between "not connected" and "connected, nothing synced yet".
 */
export async function listTrackedAccountsByUser(db: Database, userId: string) {
  return db
    .select({
      id: trackedAccounts.id,
      platform: trackedAccounts.platform,
      username: trackedAccounts.username,
      lastSyncedAt: trackedAccounts.lastSyncedAt,
    })
    .from(trackedAccounts)
    .where(eq(trackedAccounts.userId, userId))
    .orderBy(asc(trackedAccounts.createdAt));
}

export async function listAccounts(db: Database, syncQueue: SyncQueue, userId: string) {
  const accounts = await listTrackedAccountsByUser(db, userId);
  return Promise.all(
    accounts.map(async (account) =>
      Object.assign({}, account, {
        syncState: await syncQueue.getState(account.id),
      }),
    ),
  );
}
