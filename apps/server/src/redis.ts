import { Redis } from "ioredis";
import { z } from "zod";

const FAIL_FAST_TIMEOUT_MS = 2000;

// Error messages never echo the value: a Redis URL routinely carries a password.
const redisEnvSchema = z.object({
  REDIS_URL: z.url({
    protocol: /^rediss?$/,
    error: (issue) =>
      issue.input === undefined
        ? "REDIS_URL is required"
        : "REDIS_URL must be a redis:// or rediss:// URL",
  }),
});

export interface ResolvedRedisEnv {
  url: string;
}

export function resolveRedisEnv(
  env: Record<string, string | undefined>,
): ResolvedRedisEnv {
  const result = redisEnvSchema.safeParse(env);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return { url: result.data.REDIS_URL };
}

export function createRedisClient(url: string): Redis {
  // One retry, short timeouts: the rate limiter fails open, and it can only
  // do that promptly if a down Redis rejects commands instead of queuing them.
  return new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: FAIL_FAST_TIMEOUT_MS,
    commandTimeout: FAIL_FAST_TIMEOUT_MS,
  });
}

export type { Redis };
