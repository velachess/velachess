/**
 * First-run provisioning, no HTTP endpoint — env-var-based, at startup, into an empty user table only.
 * Avoids the recurring CVE pattern (Portainer, Krayin, Gitea, Immich) of unauthenticated "create first user" surfaces guarded by resettable runtime state.
 * Called a "user", not "admin": the product has no roles/RBAC to justify the word.
 */

import { count, eq } from "drizzle-orm";

import type { Database, ExecutionLock } from "@velachess/db";
import { schema } from "@velachess/db";

import type { Auth } from "@velachess/auth";

export interface BootstrapUserCredentials {
  email: string;
  password: string;
}

/** Read the well-known env vars; null when not configured (cloud, or a
 * self-hoster who created their first user some other way). */
export function bootstrapCredentialsFromEnv(
  env: Record<string, string | undefined>,
): BootstrapUserCredentials | null {
  const email = env["VELACHESS_BOOTSTRAP_USER_EMAIL"];
  const password = env["VELACHESS_BOOTSTRAP_USER_PASSWORD"];
  if (!email || !password) return null;
  return { email, password };
}

export type BootstrapOutcome =
  | { status: "created"; userId: string }
  | {
      status: "skipped";
      reason: "users-exist" | "not-configured" | "concurrent-startup";
    };

/**
 * Create the first user, once. Guard is "any user exists" (not "this email"), so it's idempotent
 * and can't overwrite credentials. Advisory lock prevents two concurrent instances both passing the count.
 * Goes through Better Auth's own sign-up API, not a hand-rolled INSERT, so hashing matches verification.
 */
export async function bootstrapUser(
  db: Database,
  auth: Auth,
  lock: ExecutionLock,
  credentials: BootstrapUserCredentials | null,
): Promise<BootstrapOutcome> {
  if (!credentials) return { status: "skipped", reason: "not-configured" };

  const release = await lock.tryAcquire("bootstrap:first-user");
  if (!release) return { status: "skipped", reason: "concurrent-startup" };

  try {
    const [row] = await db.select({ n: count() }).from(schema.users);
    if ((row?.n ?? 0) > 0) return { status: "skipped", reason: "users-exist" };

    const created = await auth.api.signUpEmail({
      body: {
        name: "VelaChess User",
        email: credentials.email,
        password: credentials.password,
      },
    });

    // signUpEmail hard-codes emailVerified: false, not overridable via the
    // body. The operator running this already controls the box the email
    // sits on, so verification proves nothing — and left false, this
    // account fails Google's account-linking check on first use.
    await db
      .update(schema.users)
      .set({ emailVerified: true })
      .where(eq(schema.users.id, created.user.id));

    return { status: "created", userId: created.user.id };
  } finally {
    await release();
  }
}
