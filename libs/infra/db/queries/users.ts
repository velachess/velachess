import { eq } from "drizzle-orm";

import type { Database } from "../client.ts";
import { users } from "../schema.ts";

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
