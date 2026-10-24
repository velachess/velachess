import { createHash } from "node:crypto";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";

import type { Database } from "@velachess/infra-db";
import { schema } from "@velachess/infra-db";
import type { AuthEmail } from "@velachess/infra-email";
import { logger } from "@velachess/infra-logger";

type SendAuthEmail = (email: AuthEmail) => Promise<void>;

export interface AuthConfig {
  db: Database;
  baseUrl: string;
  secret: string;
  secureCookies: boolean;
  trustedOrigins?: string[];
  allowSignUp?: boolean;
  google?: { clientId: string; clientSecret: string };
  // Unset behind a proxy, Better Auth cannot resolve client IPs and every
  // visitor shares one sign-in rate-limit bucket.
  trustedProxies?: string[];
  sendEmail?: SendAuthEmail;
  /** Present, it turns on `POST /auth/delete-user`. */
  deleteAccount?: (userId: string) => Promise<void>;
}

export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

// Better Auth's own links use basePath "/auth", which the browser cannot reach.
const VERIFY_EMAIL_PATH = "/api/auth/verify-email";
const RESET_PASSWORD_PATH = "/reset-password";

const authLogger = logger.child({ component: "auth" });

function appLink(baseUrl: string, path: string, params: Record<string, string>): string {
  const url = new URL(path, baseUrl);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.href;
}

function deliverWith(sendEmail: SendAuthEmail) {
  return ({
    token,
    request,
    ...email
  }: Omit<AuthEmail, "acceptLanguage" | "idempotencyKey"> & {
    token: string;
    request: Request | undefined;
  }): Promise<void> => {
    // Not awaited: the send's latency would reveal whether the address has an account.
    void sendEmail({
      ...email,
      acceptLanguage: request?.headers.get("accept-language") ?? null,
      // Hashed: a verification JWT exceeds Resend's 256-character key limit.
      idempotencyKey: `${email.template}/${createHash("sha256").update(token).digest("hex")}`,
    }).catch((error: unknown) => {
      authLogger.error({ error, template: email.template }, "auth email was not sent");
    });
    return Promise.resolve();
  };
}

export function createAuth(config: AuthConfig) {
  const deliver = config.sendEmail && deliverWith(config.sendEmail);
  const { deleteAccount } = config;

  return betterAuth({
    baseURL: config.baseUrl,
    basePath: "/auth",
    secret: config.secret,
    trustedOrigins: config.trustedOrigins ?? [config.baseUrl],

    onAPIError: { errorURL: `${config.baseUrl}/login` },

    database: drizzleAdapter(config.db, {
      provider: "pg",
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
      disableSignUp: !config.allowSignUp,
      ...(deliver
        ? {
            requireEmailVerification: true,
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: ({ user, token }, request) =>
              deliver({
                template: "reset-password",
                to: user.email,
                url: appLink(config.baseUrl, RESET_PASSWORD_PATH, { token }),
                token,
                request,
              }),
          }
        : {}),
    },

    ...(deliver
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            sendVerificationEmail: ({ user, token }, request) =>
              deliver({
                template: "verify-email",
                to: user.email,
                url: appLink(config.baseUrl, VERIFY_EMAIL_PATH, {
                  token,
                  callbackURL: "/login",
                }),
                token,
                request,
              }),
          },
        }
      : {}),

    ...(config.google
      ? {
          socialProviders: {
            google: {
              clientId: config.google.clientId,
              clientSecret: config.google.clientSecret,
              redirectURI: `${config.baseUrl}${GOOGLE_CALLBACK_PATH}`,
            },
          },
        }
      : {}),

    rateLimit: {
      storage: "database",
      modelName: "authRateLimits",
      // Better Auth's strict default covers sign-in and change-password but
      // not this, which checks a password too.
      customRules: { "/delete-user": { window: 10, max: 3 } },
    },

    user: {
      modelName: "users",
      fields: { name: "displayName" },
      additionalFields: {
        onboardedAt: { type: "date", required: false, input: false },
      },
      ...(deleteAccount
        ? {
            deleteUser: {
              enabled: true,
              beforeDelete: (user) => deleteAccount(user.id),
            },
          }
        : {}),
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
        generateId: "uuid",
      },
      useSecureCookies: config.secureCookies,
      ...(config.trustedProxies
        ? { ipAddress: { trustedProxies: config.trustedProxies } }
        : {}),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
