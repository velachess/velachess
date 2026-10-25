import { z } from "zod";

import { resolveAuthEnv, type ResolvedAuthEnv } from "@velachess/infra-auth";
import { resolveEmailEnv, type EmailConfig } from "@velachess/infra-email";
import { resolveStorageEnv, type ResolvedStorageEnv } from "@velachess/infra-storage";
import {
  bootstrapCredentialsFromEnv,
  type BootstrapUserCredentials,
} from "@velachess/user";

import { resolveRedisEnv, type ResolvedRedisEnv } from "./redis.ts";

const DEFAULT_PORT = 3000;
const PORT_ERROR = "PORT must be an integer between 1 and 65535";

const apiEnvSchema = z.object({
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: (issue) =>
      issue.input === undefined
        ? "DATABASE_URL is required"
        : "DATABASE_URL must be a postgres:// or postgresql:// URL",
  }),
  PORT: z.coerce
    .number({ error: PORT_ERROR })
    .int({ error: PORT_ERROR })
    .min(1, { error: PORT_ERROR })
    .max(65535, { error: PORT_ERROR })
    .default(DEFAULT_PORT),
});

export interface ResolvedApiEnv {
  databaseUrl: string;
  port: number;
  redis: ResolvedRedisEnv;
  auth: ResolvedAuthEnv;
  storage: ResolvedStorageEnv;
  email: EmailConfig | null;
  bootstrapCredentials: BootstrapUserCredentials | null;
}

export function resolveApiEnv(env: Record<string, string | undefined>): ResolvedApiEnv {
  const result = apiEnvSchema.safeParse(env);
  if (!result.success) throw new Error(z.prettifyError(result.error));

  const auth = resolveAuthEnv(env);
  const email = resolveEmailEnv(env);
  if (auth.magicLink && !email) {
    throw new Error(
      "VELACHESS_MAGIC_LINK needs email to send the link — set RESEND_API_KEY " +
        "and VELACHESS_EMAIL_FROM",
    );
  }

  return {
    databaseUrl: result.data.DATABASE_URL,
    port: result.data.PORT,
    redis: resolveRedisEnv(env),
    auth,
    storage: resolveStorageEnv(env),
    email,
    bootstrapCredentials: bootstrapCredentialsFromEnv(env),
  };
}
