import { drizzleAdapter } from "@better-auth/drizzle-adapter";
// The minimal entrypoint is the official initializer "without Kysely", which
// is this setup: persistence through the Drizzle adapter, migrations Drizzle's.
// Same options type and same Auth in the installed 1.7.0 dist.
import { betterAuth } from "better-auth/minimal";

import type { Database } from "@velachess/infra-db";
import { schema } from "@velachess/infra-db";

export interface AuthConfig {
  db: Database;
  baseUrl: string;
  secret: string;
  /** `true` only behind HTTPS — controls the cookie's Secure attribute. */
  secureCookies: boolean;
  /** Defaults to the baseUrl alone; anything wider is deliberate. */
  trustedOrigins?: string[];
  /**
   * Whether `POST /auth/sign-up/email` is public. Defaults to `false`: a
   * reachable self-host must not accept signups from anyone who finds it.
   * The first user comes from env-var bootstrap, through a signup-enabled
   * instance never mounted on HTTP (main.ts).
   */
  allowSignUp?: boolean;
  /**
   * Absent means the provider is not offered, not that anything throws.
   * Opens public sign-up without touching the password path: `allowSignUp`
   * governs `emailAndPassword` only, and social providers carry their own
   * `disableImplicitSignUp` (default false in better-auth 1.7.0).
   */
  google?: { clientId: string; clientSecret: string };
  /**
   * The reverse proxies in front of this API. Load-bearing and quiet when
   * wrong: Better Auth keys its rate limiter by client IP, and when it
   * cannot resolve one it falls back to a single shared bucket per path
   * (`NO_TRUSTED_IP_KEY`) with only a warning. Unset behind a proxy, the
   * whole site's sign-in shares one 3-per-10s budget.
   */
  trustedProxies?: string[];
}

/** Exported so the pinned test and the Google Cloud console value in
 * self-host.md have one source. */
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

export function createAuth(config: AuthConfig) {
  return betterAuth({
    baseURL: config.baseUrl,
    // The API serves auth under /auth/*; the web app's dev proxy adds the
    // /api prefix the browser sees. Better Auth's default /api/auth would
    // 404 every request the API receives.
    basePath: "/auth",
    secret: config.secret,
    trustedOrigins: config.trustedOrigins ?? [config.baseUrl],

    // The default, baseURL + basePath + "/error", is a path this SPA never
    // routes, so an OAuth failure with no recoverable state
    // (state_mismatch, invalid_callback_request) 404s instead of reaching
    // the sign-in screen's error copy.
    onAPIError: { errorURL: `${config.baseUrl}/login` },

    database: drizzleAdapter(config.db, {
      provider: "pg",
      // Keyed by the modelName each model maps to below: the adapter
      // resolves tables through those names, not its defaults.
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        authAccounts: schema.authAccounts,
        verifications: schema.verifications,
        authRateLimits: schema.authRateLimits,
      },
    }),

    emailAndPassword: {
      enabled: true,
      // Closed by default; see AuthConfig.allowSignUp.
      disableSignUp: !config.allowSignUp,
    },

    // The only route to public sign-up that does not drag in password
    // reset, email verification and SMTP. The whole key is conditional so an
    // unconfigured provider is absent rather than present with empty
    // credentials, which Better Auth accepts and then fails on at redirect.
    ...(config.google
      ? {
          socialProviders: {
            google: {
              clientId: config.google.clientId,
              clientSecret: config.google.clientSecret,
              // Explicit, under /api: the default derives from baseURL +
              // basePath ("/auth") and would need a second proxy rule.
              redirectURI: `${config.baseUrl}${GOOGLE_CALLBACK_PATH}`,
            },
          },
        }
      : {}),

    // Better Auth already applies stricter built-in rules to the sensitive
    // paths (getDefaultSpecialRules in its rate-limiter); restating them
    // here would drift on an upgrade. Only the storage needs saying: the
    // default is per-instance process memory, and `database` makes the limit
    // hold across restarts and across every API process. The table prunes
    // itself (`deleteExpiredRows` inside consume).
    rateLimit: {
      storage: "database",
      modelName: "authRateLimits",
    },

    // Type inference keeps Better Auth's names (`user.name`), the rows keep
    // ours (`display_name`).
    user: {
      modelName: "users",
      fields: { name: "displayName" },
      // Rides along on the session Better Auth already answers with, so the
      // app reads onboarding from a query it always makes. `input: false`
      // because the server stamps it and a client must not claim it. No
      // `fieldName`: the adapter maps onto the Drizzle property, which
      // already matches.
      additionalFields: {
        onboardedAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      modelName: "sessions",
    },
    account: {
      modelName: "authAccounts",
    },
    verification: {
      modelName: "verifications",
    },

    advanced: {
      database: {
        // Matches users.id and every foreign key onto it.
        generateId: "uuid",
      },
      // HttpOnly and SameSite=Lax are Better Auth defaults; Secure is the
      // one attribute that differs by deployment, since localhost has no
      // TLS. Development passes `secureCookies: false`; production never
      // weakens it.
      useSecureCookies: config.secureCookies,
      // See AuthConfig.trustedProxies: unset, every client behind the proxy
      // collapses into one rate-limit bucket.
      ...(config.trustedProxies
        ? { ipAddress: { trustedProxies: config.trustedProxies } }
        : {}),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
