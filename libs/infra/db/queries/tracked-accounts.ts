import type { ChessComCursor, LichessCursor } from "@velachess/platforms";
import { and, eq } from "drizzle-orm";

import type { Database } from "../client.ts";
import { trackedAccounts } from "../schema.ts";

type Platform = "chess_com" | "lichess";
type Cursor = ChessComCursor | LichessCursor;

/**
 * Ownership is part of the conflict key — `(user_id, platform, username)`
 * — so two users tracking the same handle get two rows. Previously
 * platform+username was globally unique with a separate ownership
 * UPDATE, which let an import silently steal another user's archive.
 *
 * Identity does not live here: provider metadata is public and shared,
 * so it is cached once per handle in `provider_profiles` (see
 * provider-profiles.ts), not per connection.
 */
export async function upsertTrackedAccount(
  db: Database,
  userId: string,
  platform: Platform,
  username: string,
) {
  const normalized = username.toLowerCase();
  const [account] = await db
    .insert(trackedAccounts)
    .values({ userId, platform, username: normalized })
    .onConflictDoUpdate({
      target: [
        trackedAccounts.userId,
        trackedAccounts.platform,
        trackedAccounts.username,
      ],
      set: {
        username: normalized,
      },
    })
    .returning();

  return account!;
}

export async function getTrackedAccountCursor(
  db: Database,
  accountId: string,
): Promise<Cursor | null> {
  const [account] = await db
    .select({ syncCursor: trackedAccounts.syncCursor })
    .from(trackedAccounts)
    .where(eq(trackedAccounts.id, accountId));

  return account?.syncCursor ?? null;
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

/** The user's connection to a handle, if they track it. Reads never create. */
export async function findTrackedAccount(
  db: Database,
  userId: string,
  platform: Platform,
  username: string,
) {
  const [account] = await db
    .select()
    .from(trackedAccounts)
    .where(
      and(
        eq(trackedAccounts.userId, userId),
        eq(trackedAccounts.platform, platform),
        eq(trackedAccounts.username, username.toLowerCase()),
      ),
    );
  return account ?? null;
}
