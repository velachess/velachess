import { Redis } from "ioredis";

const FAIL_FAST_TIMEOUT_MS = 2000;

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
