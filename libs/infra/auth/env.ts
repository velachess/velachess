import { z } from "zod";

const EXAMPLE_SECRET = "change-me-to-a-random-32-character-secret";
const GENERATE_SECRET = "Generate one: openssl rand -base64 32";

// Compose passes an unset variable as "".
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const commaList = z
  .string()
  .optional()
  .transform(
    (value) =>
      value
        ?.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean) ?? [],
  );

const authEnvSchema = z.object({
  // 32 characters is Better Auth's own floor.
  VELACHESS_AUTH_SECRET: z
    .string({
      error: `VELACHESS_AUTH_SECRET is required — it signs session tokens. ${GENERATE_SECRET}`,
    })
    .min(32, {
      error: `VELACHESS_AUTH_SECRET is too short — use at least 32 characters. ${GENERATE_SECRET}`,
    }),
  VELACHESS_BASE_URL: z
    .url({
      protocol: /^https?$/,
      error: "VELACHESS_BASE_URL must be an http:// or https:// URL",
    })
    .optional(),
  VELACHESS_TRUSTED_ORIGINS: commaList.pipe(
    z.array(
      z.url({
        error: (issue) =>
          `VELACHESS_TRUSTED_ORIGINS contains an invalid origin: ${String(issue.input)}`,
      }),
    ),
  ),
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  VELACHESS_PASSWORD_SIGN_IN: z.stringbool().default(true),
  VELACHESS_MAGIC_LINK: z.stringbool().default(false),
  VELACHESS_TRUSTED_PROXIES: commaList,
});

export function resolveAuthEnv(env: Record<string, string | undefined>) {
  const parsed = authEnvSchema.parse(env);
  const production = env["NODE_ENV"] === "production";

  if (production && parsed.VELACHESS_AUTH_SECRET === EXAMPLE_SECRET) {
    throw new Error(
      "VELACHESS_AUTH_SECRET is still the .env.example placeholder — " +
        `production needs its own secret. ${GENERATE_SECRET}`,
    );
  }

  if (production && !parsed.VELACHESS_BASE_URL) {
    throw new Error(
      "VELACHESS_BASE_URL is required in production — the public URL the " +
        "app is served on (e.g. https://chess.example.com, or " +
        "http://localhost:3000 for a machine-local install)",
    );
  }

  const baseUrl = parsed.VELACHESS_BASE_URL ?? "http://localhost:3000";
  const { origin, protocol } = new URL(baseUrl);
  const secureCookies = protocol === "https:";

  // Better Auth accepts an empty half and only fails at the redirect.
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = parsed;
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together — " +
        "set both to enable Google sign-in, or neither to disable it",
    );
  }

  if (!parsed.VELACHESS_PASSWORD_SIGN_IN && !clientId && !parsed.VELACHESS_MAGIC_LINK) {
    throw new Error(
      "There is no way to sign in: VELACHESS_PASSWORD_SIGN_IN is false and " +
        "neither Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) nor " +
        "VELACHESS_MAGIC_LINK is set",
    );
  }

  const trustedProxies = parsed.VELACHESS_TRUSTED_PROXIES;

  return {
    secret: parsed.VELACHESS_AUTH_SECRET,
    baseUrl,
    secureCookies,
    trustedOrigins: [
      origin,
      ...parsed.VELACHESS_TRUSTED_ORIGINS.map((entry) => new URL(entry).origin),
    ],
    passwordSignIn: parsed.VELACHESS_PASSWORD_SIGN_IN,
    ...(clientId && clientSecret ? { google: { clientId, clientSecret } } : {}),
    magicLink: parsed.VELACHESS_MAGIC_LINK,
    ...(trustedProxies.length > 0 ? { trustedProxies } : {}),
    insecureProductionTransport: production && !secureCookies,
  };
}
