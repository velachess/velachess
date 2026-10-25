import { Redis } from "ioredis";

export function createRedisClient(url: string) {
  // One retry, short timeouts: the rate limiter fails open, and it can only
  // do that promptly if a down Redis rejects commands instead of queuing them.
  return new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
  });
}

export type { Redis };
