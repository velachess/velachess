/**
 * [AUTH ENV] — turns ambient env vars into a validated auth config, or
 * throws a message naming the variable and requirement to fix. Pure
 * (`resolveAuthEnv(env)` takes env as a value) so main.ts stays wiring.
 * Never echoes `VELACHESS_AUTH_SECRET`'s value in any error or log.
 */

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
  /** Addresses of the reverse proxies in front of the API, from
   * VELACHESS_TRUSTED_PROXIES. Absent behind a proxy collapses every
   * client into one rate-limit bucket — see AuthConfig.trustedProxies. */
  trustedProxies?: string[];
  /** Production served over plain http — legal for a LAN self-host, but
   * main.ts warns loudly: session cookies ride unencrypted. */
  insecureProductionTransport: boolean;
}

export function resolveAuthEnv(env: Record<string, string | undefined>): ResolvedAuthEnv {
  const production = env["NODE_ENV"] === "production";

  // The secret signs session tokens; it is permanent infrastructure, not
  // a first-run convenience (contrast the bootstrap password, which is
  // designed to be removed — docs/how-to/self-host.md). 32 characters is
  // Better Auth's own floor for a real secret, enforced in every mode so
  // development cannot drift onto a value production would reject.
  const secret = env["VELACHESS_AUTH_SECRET"];
  if (!secret) {
    throw new Error(
      "VELACHESS_AUTH_SECRET is required — it signs session tokens. " +
        "Generate one: openssl rand -base64 32",
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "VELACHESS_AUTH_SECRET is too short — use at least 32 characters. " +
        "Generate one: openssl rand -base64 32",
    );
  }
  if (production && secret === EXAMPLE_SECRET) {
    throw new Error(
      "VELACHESS_AUTH_SECRET is still the .env.example placeholder — " +
        "production needs its own secret. Generate one: openssl rand -base64 32",
    );
  }

  // Production must say where it is served; a silently-defaulted
  // localhost baseURL in production produces cookies and trusted origins
  // for a host nobody is on. Development gets the conventional default.
  const rawBaseUrl = env["VELACHESS_BASE_URL"];
  if (production && !rawBaseUrl) {
    throw new Error(
      "VELACHESS_BASE_URL is required in production — the public URL the " +
        "app is served on (e.g. https://chess.example.com, or " +
        "http://localhost:3000 for a machine-local install)",
    );
  }
  const baseUrl = rawBaseUrl ?? "http://localhost:3000";

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`VELACHESS_BASE_URL is not a valid URL: ${baseUrl}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`VELACHESS_BASE_URL must be http:// or https://, got: ${baseUrl}`);
  }

  // Secure follows the actual transport. Never weakened the other way:
  // an https deployment always gets Secure cookies, and there is no
  // switch to turn that off for development convenience — development
  // uses an http URL, which has no TLS for Secure to bind to.
  const secureCookies = parsed.protocol === "https:";

  // Origins the auth endpoints will accept browser requests from. The
  // app's own origin is always trusted; anything beyond it (a separate
  // web origin in front of the API) must be listed deliberately.
  const trustedOrigins = [parsed.origin];
  const extraOrigins = env["VELACHESS_TRUSTED_ORIGINS"];
  if (extraOrigins) {
    for (const entry of extraOrigins.split(",")) {
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

  // Google OAuth is optional, but half-configured is not: one variable
  // without the other means somebody intended to enable sign-in with
  // Google and stopped halfway. Better Auth would accept the empty
  // credential and only fail at the redirect, as a broken button in
  // production — so it fails here, at boot, where it is legible.
  const googleId = env["GOOGLE_CLIENT_ID"]?.trim();
  const googleSecret = env["GOOGLE_CLIENT_SECRET"]?.trim();
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

  // Reverse-proxy addresses, so Better Auth trusts X-Forwarded-For from
  // them and only them. Left unset on a direct-to-internet deployment,
  // where the socket address is already the client's.
  const rawProxies = env["VELACHESS_TRUSTED_PROXIES"];
  const trustedProxies = rawProxies
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    secret,
    baseUrl,
    secureCookies,
    trustedOrigins,
    ...(google ? { google } : {}),
    ...(trustedProxies?.length ? { trustedProxies } : {}),
    insecureProductionTransport: production && !secureCookies,
  };
}
