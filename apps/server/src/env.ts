import { z } from "zod";

import { resolveAuthEnv } from "@velachess/infra-auth";
import { resolveEmailEnv } from "@velachess/infra-email";
import { resolveStorageEnv } from "@velachess/infra-storage";
import { bootstrapCredentialsFromEnv } from "@velachess/user";

// Error messages never echo the value: both URLs routinely carry a password.
const apiEnvSchema = z.object({
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: (issue) =>
      issue.input === undefined
        ? "DATABASE_URL is required"
        : "DATABASE_URL must be a postgres:// or postgresql:// URL",
  }),
  REDIS_URL: z.url({
    protocol: /^rediss?$/,
    error: (issue) =>
      issue.input === undefined
        ? "REDIS_URL is required"
        : "REDIS_URL must be a redis:// or rediss:// URL",
  }),
  PORT: z.coerce
    .number({ error: "PORT must be an integer between 1 and 65535" })
    .int()
    .min(1)
    .max(65535)
    .default(3000),
});

export function resolveApiEnv(env: Record<string, string | undefined>) {
  const { DATABASE_URL, REDIS_URL, PORT } = apiEnvSchema.parse(env);

  const auth = resolveAuthEnv(env);
  const email = resolveEmailEnv(env);
  if (auth.magicLink && !email) {
    throw new Error(
      "VELACHESS_MAGIC_LINK needs email to send the link — set RESEND_API_KEY " +
        "and VELACHESS_EMAIL_FROM",
    );
  }

  return {
    databaseUrl: DATABASE_URL,
    redisUrl: REDIS_URL,
    port: PORT,
    auth,
    storage: resolveStorageEnv(env),
    email,
    bootstrapCredentials: bootstrapCredentialsFromEnv(env),
  };
}
