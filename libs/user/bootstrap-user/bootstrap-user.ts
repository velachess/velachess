/**
 * Env-var provisioning at startup, into an empty user table only: there is
 * no HTTP endpoint, a pattern with CVEs to its name in Portainer, Krayin,
 * Gitea and Immich, where resettable runtime state guarded an
 * unauthenticated "create first user" surface.
 */

export interface BootstrapUserCredentials {
  email: string;
  password: string;
}

/** Null when not configured, which a self-hoster who created their first
 * user another way is. */
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
 * The guard is "any user exists" rather than "this email", so it cannot
 * overwrite credentials, and the advisory lock stops two concurrent
 * instances both passing the count. Creation goes through Better Auth's own
 * sign-up API, so hashing matches verification.
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

    // `signUpEmail` hard-codes `emailVerified: false` with no override, and
    // left false this account fails Google's account-linking check on first
    // use. The operator already controls the box the email sits on.
    await deps.markEmailVerified(created.user.id);

    return { status: "created", userId: created.user.id };
  } finally {
    await release();
  }
}
