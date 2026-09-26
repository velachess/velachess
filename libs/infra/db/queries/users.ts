import { count, eq } from "drizzle-orm";

import type { Database } from "../client.ts";
import { users } from "../schema.ts";

/** Whether any user exists — the bootstrap module's own guard, not "this
 * email exists". */
export async function countUsers(db: Database) {
  const [row] = await db.select({ n: count() }).from(users);
  return row?.n ?? 0;
}

/** Better Auth's own sign-up hard-codes emailVerified: false; the bootstrap
 * module corrects it for the operator-provisioned first user. */
export async function markEmailVerified(db: Database, userId: string) {
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
}

/** What the avatar slices need to decide their next write: the effective
 * URL and who last set it. `null` for a user that does not exist, so a
 * caller can tell that apart from a user with no picture. */
export async function readAvatarState(db: Database, userId: string) {
  const [row] = await db
    .select({ image: users.image, avatarSource: users.avatarSource })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

/**
 * The only writer of `users.image` in this repo — Better Auth writes it
 * once at user creation and never again. Both columns move together
 * because the pair is the state: an `image` without its source, or a
 * source without its `image`, is a row nothing can interpret.
 */
export async function writeAvatarState(
  db: Database,
  userId: string,
  next: { image: string | null; avatarSource: string | null },
) {
  await db
    .update(users)
    .set({ image: next.image, avatarSource: next.avatarSource })
    .where(eq(users.id, userId));
}

let seq = 0;

/**
 * A user row for TESTS. Production users are created by Better Auth
 * through sign-up — nothing in a request path calls this, and the
 * generated defaults exist so a fixture can say `createUser(db)` without
 * inventing an email that then collides with the second fixture's.
 */
export async function createUser(
  db: Database,
  data: { displayName?: string; email?: string } = {},
) {
  seq += 1;
  const [user] = await db
    .insert(users)
    .values({
      displayName: data.displayName ?? "Test User",
      email: data.email ?? `user-${seq}-${Date.now()}@test.local`,
    })
    .returning();
  return user!;
}

/** Race-safe get-or-create by email — for tests that need a stable user. */
export async function ensureUser(db: Database, email: string, displayName?: string) {
  await db
    .insert(users)
    .values({ email, displayName: displayName ?? "Test User" })
    .onConflictDoNothing();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user!;
}
