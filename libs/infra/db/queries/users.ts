import { and, count, eq, isNull } from "drizzle-orm";

import type { Database } from "../client.ts";
import { users, type User } from "../schema.ts";

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

/**
 * Stamps the end of onboarding, once. The `IS NULL` guard is what makes
 * it once: every later connection runs this and changes nothing, so the
 * date keeps saying when the person actually arrived.
 */
export async function markUserOnboarded(db: Database, userId: string): Promise<void> {
  await db
    .update(users)
    .set({ onboardedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.onboardedAt)));
}

/**
 * The only writer of `users.image` in this repo — Better Auth writes it
 * once at user creation and never again. Both columns move together
 * because the pair is the state: an `image` without its source, or a
 * source without its `image`, is a row nothing can interpret.
 */
/**
 * The two values `users.avatar_source` may hold, read off the column
 * itself — the `$type<>()` there is the one declaration. Exported because
 * `libs/user` checks its own `AvatarSource` against it (infra may not
 * depend on a business module, so the guard runs from that side). The
 * column has no DB constraint, so this type is the only thing standing
 * between a typo and a row nothing can interpret.
 */
export type AvatarSource = NonNullable<User["avatarSource"]>;

export async function writeAvatarState(
  db: Database,
  userId: string,
  // Both fields are exactly their columns, so they are read off the model
  // rather than restated. Still a two-field `next` and not the whole
  // `User`: this is an update contract, not a row write.
  next: Pick<User, "image" | "avatarSource">,
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
