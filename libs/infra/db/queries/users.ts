import { and, count, eq, isNull } from "drizzle-orm";

import type { Database } from "../client.ts";
import { syncJobs, users, verifications, type User } from "../schema.ts";

export async function countUsers(db: Database) {
  const [row] = await db.select({ n: count() }).from(users);
  return row?.n ?? 0;
}

/** Better Auth's sign-up hard-codes `emailVerified: false`, which bootstrap
 * corrects for the operator-provisioned first user. */
export async function markEmailVerified(db: Database, userId: string) {
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
}

/**
 * The `IS NULL` guard is what makes it once: every later connection runs
 * this and changes nothing.
 */
export async function markUserOnboarded(db: Database, userId: string): Promise<void> {
  await db
    .update(users)
    .set({ onboardedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.onboardedAt)));
}

/**
 * Read off the column, whose `$type<>()` is the one declaration. Exported
 * because `libs/user` checks its own `AvatarSource` against it, infra not
 * being allowed to depend on a business module.
 */
export type AvatarSource = NonNullable<User["avatarSource"]>;

export async function writeAvatarState(
  db: Database,
  userId: string,
  // Two fields rather than the whole `User`: an update contract, not a row
  // write. Both columns move together, because an `image` without its
  // source is a row nothing can interpret.
  next: Pick<User, "image" | "avatarSource">,
) {
  await db
    .update(users)
    .set({ image: next.image, avatarSource: next.avatarSource })
    .where(eq(users.id, userId));
}

/** See docs/explanation/modules/db.md: one transaction, owned rows by cascade. */
export async function deleteUser(db: Database, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Jobs, then the user — the order every sync writer takes them, the
    // user through the games' FK. Deleting the user first deadlocked
    // against a sync mid-commit.
    await tx
      .select({ id: syncJobs.id })
      .from(syncJobs)
      .where(eq(syncJobs.userId, userId))
      .for("update");
    await tx.delete(verifications).where(eq(verifications.value, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}

let seq = 0;

/**
 * For tests: production users come from Better Auth's sign-up, and no
 * request path calls this. The generated defaults let a fixture say
 * `createUser(db)` without inventing a colliding email.
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

/** For tests that need a stable user. */
export async function ensureUser(db: Database, email: string, displayName?: string) {
  await db
    .insert(users)
    .values({ email, displayName: displayName ?? "Test User" })
    .onConflictDoNothing();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user!;
}
