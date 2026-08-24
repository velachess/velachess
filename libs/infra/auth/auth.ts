/**
 * [AUTH] — who is making this request, nothing else. Owns Better Auth
 * config/sessions/bootstrap; authorization ("may this user touch this
 * game") lives in application/db instead (__tests__/architecture.test.ts
 * enforces the direction). generateId: "uuid" matches users.id's type;
 * modelName/fields map onto this schema's existing table/column names.
 */

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
// The minimal entrypoint is the official initializer "without Kysely" —
// exactly this setup: persistence goes through the Drizzle adapter and
// migrations are Drizzle's. Verified against the installed 1.7.0 dist
// (dist/auth/minimal.d.mts), not assumed: same options type, same Auth.
import { betterAuth } from "better-auth/minimal";

import type { Database } from "@velachess/db";
import { schema } from "@velachess/db";

export interface AuthConfig {
  db: Database;
  /** Where the app is served — becomes Better Auth's baseURL and a trusted origin. */
  baseUrl: string;
  /** Signs session tokens. Required outside tests. */
  secret: string;
  /** `true` only behind HTTPS — controls the cookie's Secure attribute. */
  secureCookies: boolean;
  /** Origins the auth endpoints accept browser requests from. Defaults
   * to the baseUrl alone — anything wider is a deliberate decision. */
  trustedOrigins?: string[];
  /**
   * Whether `POST /auth/sign-up/email` is public. Defaults to `false` —
   * a network-reachable self-host must not accept signups from anyone
   * who finds it. The first user comes from env-var bootstrap via a
   * separate signup-enabled instance never mounted on HTTP (main.ts).
   */
  allowSignUp?: boolean;
  /**
   * Google OAuth, when configured. Absent means the provider is simply not
   * offered — the button disappears, nothing throws.
   *
   * This is what opens public sign-up without touching the password path:
   * `disableSignUp` above governs `emailAndPassword` only, and social
   * providers carry their own (`disableImplicitSignUp`, default false).
   * Verified in better-auth 1.7.0, not assumed.
   */
  google?: { clientId: string; clientSecret: string };
  /**
   * Addresses of the reverse proxies in front of this API.
   *
   * Load-bearing, and quiet when wrong. Better Auth keys its rate limiter
   * by client IP; when it cannot resolve one it falls back to a single
   * shared bucket per path (`NO_TRUSTED_IP_KEY` in its rate-limiter) and
   * only logs a warning. Behind a proxy with this unset, the whole site's
   * sign-in shares one 3-per-10s budget — three attempts by anyone lock
   * out everyone, and the symptom reads as "I can't log in", never as a
   * misconfigured limiter.
   */
  trustedProxies?: string[];
}

/** One Better Auth instance per process, built from injected deps the way
 * apps/api builds everything else — never from ambient env reads here. */
export function createAuth(config: AuthConfig) {
  return betterAuth({
    baseURL: config.baseUrl,
    // The API serves auth under /auth/* — the web app's dev proxy adds
    // the /api prefix the browser sees. Better Auth's default basePath
    // is /api/auth, which would 404 every request the API receives.
    basePath: "/auth",
    secret: config.secret,
    trustedOrigins: config.trustedOrigins ?? [config.baseUrl],

    database: drizzleAdapter(config.db, {
      provider: "pg",
      // Keyed by the modelName each model maps to below — the adapter
      // resolves tables through those names, not through its defaults.
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
      // Closed by default — see AuthConfig.allowSignUp. `disableSignUp`
      // is the documented option for exactly this
      // (@better-auth/core dist/types/init-options.d.mts, @default false).
      disableSignUp: !config.allowSignUp,
    },

    // Social sign-in, and the only route to public sign-up that does not
    // drag in password reset, email verification and an SMTP dependency.
    // The whole key is conditional so an unconfigured provider is absent
    // rather than present with empty credentials, which Better Auth would
    // accept and then fail on at redirect time.
    ...(config.google
      ? {
          socialProviders: {
            google: {
              clientId: config.google.clientId,
              clientSecret: config.google.clientSecret,
            },
          },
        }
      : {}),

    // Auth throttling belongs to Better Auth, not to a second limiter in
    // front of it: it already applies stricter built-in rules to the
    // sensitive paths (3 per 10s on /sign-in*, /sign-up*, /change-password*
    // and /change-email*; 3 per 60s on password reset, verification and
    // OTP — getDefaultSpecialRules in its rate-limiter). Declaring those
    // again here would only drift from the library on an upgrade.
    //
    // What DOES need saying is the storage: the default is process memory,
    // which resets on deploy and is per-instance. `database` makes the
    // limit hold across restarts and across however many API processes
    // run. The table prunes itself (`deleteExpiredRows` inside consume) —
    // no cleanup job.
    rateLimit: {
      storage: "database",
      modelName: "authRateLimits",
    },

    // Our tables, our names. Type inference keeps Better Auth's names
    // (`user.name`), the rows keep ours (`display_name`).
    user: {
      modelName: "users",
      fields: { name: "displayName" },
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
        // uuid, to match every existing foreign key.
        generateId: "uuid",
      },
      // HttpOnly and SameSite=Lax are Better Auth defaults; Secure is the
      // one attribute that legitimately differs by deployment (localhost
      // has no TLS). Never weakened in production to ease development —
      // development passes `secureCookies: false` instead.
      useSecureCookies: config.secureCookies,
      // See AuthConfig.trustedProxies: without this, every client behind
      // the proxy collapses into one rate-limit bucket.
      ...(config.trustedProxies
        ? { ipAddress: { trustedProxies: config.trustedProxies } }
        : {}),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
