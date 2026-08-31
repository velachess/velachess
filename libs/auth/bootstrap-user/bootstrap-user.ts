/**
 * First-run provisioning, no HTTP endpoint — env-var-based, at startup, into an empty user table only.
 * Avoids the recurring CVE pattern (Portainer, Krayin, Gitea, Immich) of unauthenticated "create first user" surfaces guarded by resettable runtime state.
 * Called a "user", not "admin": the product has no roles/RBAC to justify the word.
 */

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

export interface SignUpEmailInput {
  name: string;
  email: string;
  password: string;
}

export interface SignUpEmailResult {
  user: { id: string };
}

export type CountUsers = () => Promise<number>;
export type SignUpEmail = (input: SignUpEmailInput) => Promise<SignUpEmailResult>;
export type MarkEmailVerified = (userId: string) => Promise<void>;
export type TryAcquireLock = (key: string) => Promise<(() => Promise<void>) | null>;

export interface BootstrapUserDeps {
  countUsers: CountUsers;
  signUpEmail: SignUpEmail;
  markEmailVerified: MarkEmailVerified;
  tryAcquireLock: TryAcquireLock;
}

/**
 * Create the first user, once. Guard is "any user exists" (not "this email"), so it's idempotent
 * and can't overwrite credentials. Advisory lock prevents two concurrent instances both passing the count.
 * Goes through Better Auth's own sign-up API, not a hand-rolled INSERT, so hashing matches verification.
 */
export async function bootstrapUser(
  deps: BootstrapUserDeps,
  credentials: BootstrapUserCredentials | null,
): Promise<BootstrapOutcome> {
  if (!credentials) return { status: "skipped", reason: "not-configured" };

  const release = await deps.tryAcquireLock("bootstrap:first-user");
  if (!release) return { status: "skipped", reason: "concurrent-startup" };

  try {
    const existing = await deps.countUsers();
    if (existing > 0) return { status: "skipped", reason: "users-exist" };

    const created = await deps.signUpEmail({
      name: "VelaChess User",
      email: credentials.email,
      password: credentials.password,
    });

    // signUpEmail hard-codes emailVerified: false, not overridable via the
    // body. The operator running this already controls the box the email
    // sits on, so verification proves nothing — and left false, this
    // account fails Google's account-linking check on first use.
    await deps.markEmailVerified(created.user.id);

    return { status: "created", userId: created.user.id };
  } finally {
    await release();
  }
}
