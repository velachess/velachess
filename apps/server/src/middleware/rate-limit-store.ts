import {
  RedisStore,
  type ClientRateLimitInfo,
  type RedisClient,
} from "hono-rate-limiter";
import { logger } from "@velachess/infra-logger";

import type { Redis } from "../redis.ts";
import type { ApiEnv } from "../server.ts";

const storeLogger = logger.child({ component: "rate-limit" });

function ioredisClient(redis: Redis): RedisClient {
  return {
    scriptLoad: async (script) => {
      const sha = await redis.script("LOAD", script);
      if (typeof sha !== "string")
        throw new TypeError("SCRIPT LOAD did not return a SHA1");
      return sha;
    },
    evalsha: <TArgs extends unknown[], TData = unknown>(
      sha1: string,
      keys: string[],
      args: TArgs,
    ) =>
      // oxlint-disable-next-line typescript/consistent-type-assertions -- RedisClient.evalsha is generic in its reply; RedisStore validates the reply itself
      redis.evalsha(sha1, keys.length, ...keys, ...args.map(String)) as Promise<TData>,
    decr: (key) => redis.decr(key),
    del: (key) => redis.del(key),
  };
}

/** Fails open: an unreachable Redis allows the request rather than refusing every one. */
export class FailOpenRedisStore extends RedisStore<ApiEnv> {
  constructor(redis: Redis) {
    super({ client: ioredisClient(redis) });
  }

  override async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      return await super.increment(key);
    } catch (error) {
      storeLogger.warn({ error, key }, "rate limiter unavailable; allowing the request");
      return { totalHits: 0 };
    }
  }
}
