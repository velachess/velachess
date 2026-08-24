/**
 * [AUTH ENV] — turns ambient env vars into a validated auth config, or
 * throws a message naming the variable and requirement to fix. Pure
 * (`resolveAuthEnv(env)` takes env as a value) so main.ts stays wiring.
 * Never echoes `VELACHESS_AUTH_SECRET`'s value in any error or log.
 *
 * `production` is computed independently of envalid's own isProduction,
 * which treats an unset NODE_ENV as production — this repo's opposite.
 */

import { cleanEnv, EnvError, makeValidator, str } from "envalid";

/** The .env.example placeholder — booting production with it means the
 * file was copied verbatim, which is indistinguishable from no secret. */
const EXAMPLE_SECRET = "change-me-to-a-random-32-character-secret";

export interface ResolvedAuthEnv {
  secret: string;
  baseUrl: string;
  /** Derived from the baseUrl scheme — https means Secure cookies. */
  secureCookies: boolean;
  /** The baseUrl origin plus any VELACHESS_TRUSTED_ORIGINS entries. */
  trustedOrigins: string[];
  /** Google OAuth credentials, when both are present. Absent means the
   * provider is simply not offered. */
  google?: { clientId: string; clientSecret: string };
  /** Reverse proxy addresses. Absent behind a real proxy collapses every
   * client into one rate-limit bucket — see AuthConfig.trustedProxies. */
  trustedProxies?: string[];
  /** Production served over plain http — legal for a LAN self-host, but
   * main.ts warns loudly: session cookies ride unencrypted. */
  insecureProductionTransport: boolean;
}

// 32 characters is Better Auth's own floor for a real secret — str() has
// no minLength, so this is the one var that needs a custom parser.
const authSecret = makeValidator<string>((input) => {
  if (input.length < 32) {
    throw new EnvError(
      "VELACHESS_AUTH_SECRET is too short — use at least 32 characters. " +
        "Generate one: openssl rand -base64 32",
    );
  }
  return input;
});

/** envalid's default reporter logs and calls process.exit(1); this
 * throws the first underlying error instead, so a bad env is provable
 * without a process. */
function throwFirstError({ errors }: { errors: Record<string, Error> }): void {
  const [firstError] = Object.values(errors);
  if (firstError) throw firstError;
}

export function resolveAuthEnv(env: Record<string, string | undefined>): ResolvedAuthEnv {
  const production = env["NODE_ENV"] === "production";

  const cleaned = cleanEnv(
    env,
    {
      VELACHESS_AUTH_SECRET: authSecret({
        desc:
          "VELACHESS_AUTH_SECRET is required — it signs session tokens. " +
          "Generate one: openssl rand -base64 32",
      }),
      // A bare default, not devDefault: whether production may rely on
      // it is the policy check below, not a shape one.
      VELACHESS_BASE_URL: str({ default: "http://localhost:3000" }),
      VELACHESS_TRUSTED_ORIGINS: str({ default: undefined }),
      GOOGLE_CLIENT_ID: str({ default: undefined }),
      GOOGLE_CLIENT_SECRET: str({ default: undefined }),
      VELACHESS_TRUSTED_PROXIES: str({ default: undefined }),
    },
    { reporter: throwFirstError },
  );

  if (production && cleaned.VELACHESS_AUTH_SECRET === EXAMPLE_SECRET) {
    throw new Error(
      "VELACHESS_AUTH_SECRET is still the .env.example placeholder — " +
        "production needs its own secret. Generate one: openssl rand -base64 32",
    );
  }

  // Against the raw value, not the defaulted one — production must say
  // where it's served, not inherit the machine-local default.
  if (production && env["VELACHESS_BASE_URL"] === undefined) {
    throw new Error(
      "VELACHESS_BASE_URL is required in production — the public URL the " +
        "app is served on (e.g. https://chess.example.com, or " +
        "http://localhost:3000 for a machine-local install)",
    );
  }

  const baseUrl = cleaned.VELACHESS_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`VELACHESS_BASE_URL is not a valid URL: ${baseUrl}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`VELACHESS_BASE_URL must be http:// or https://, got: ${baseUrl}`);
  }

  // No switch to weaken this for convenience — https always means Secure.
  const secureCookies = parsed.protocol === "https:";

  // The app's own origin is always trusted; anything beyond it is deliberate.
  const trustedOrigins = [parsed.origin];
  if (cleaned.VELACHESS_TRUSTED_ORIGINS) {
    for (const entry of cleaned.VELACHESS_TRUSTED_ORIGINS.split(",")) {
      const candidate = entry.trim();
      if (!candidate) continue;
      try {
        trustedOrigins.push(new URL(candidate).origin);
      } catch {
        throw new Error(
          `VELACHESS_TRUSTED_ORIGINS contains an invalid origin: ${candidate}`,
        );
      }
    }
  }

  // Half-configured means someone intended Google and stopped halfway —
  // Better Auth would accept the empty half and only fail at the redirect.
  const googleId = cleaned.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = cleaned.GOOGLE_CLIENT_SECRET?.trim();
  if (Boolean(googleId) !== Boolean(googleSecret)) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together — " +
        "set both to enable Google sign-in, or neither to disable it",
    );
  }
  const google =
    googleId && googleSecret
      ? { clientId: googleId, clientSecret: googleSecret }
      : undefined;

  const trustedProxies = cleaned.VELACHESS_TRUSTED_PROXIES?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    secret: cleaned.VELACHESS_AUTH_SECRET,
    baseUrl,
    secureCookies,
    trustedOrigins,
    ...(google ? { google } : {}),
    ...(trustedProxies?.length ? { trustedProxies } : {}),
    insecureProductionTransport: production && !secureCookies,
  };
}
