/**
 * `hono-rate-limiter`'s `Store` contract, backed by Redis instead of its
 * bundled `MemoryStore` — the swap this file exists for: an in-memory
 * counter is per-instance and forgets on deploy, which is a limit that
 * lies the moment there is more than one API process.
 *
 * One atomic script per increment: `INCR` and, only on the first hit,
 * `PEXPIRE` — fixed-window counting with no race between "did this request
 * start the window" and "set its lifetime."
 */
import type { Redis } from "@velachess/infra-rate-limit";
import type { ClientRateLimitInfo, Store } from "hono-rate-limiter";
import { logger } from "@velachess/infra-logger";

const storeLogger = logger.child({ component: "rate-limit" });

const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('PTTL', KEYS[1])}
`;

export class RedisRateLimitStore implements Store {
  // Plain fields, not constructor parameter properties: apps/server runs
  // under Node's --experimental-strip-types, which strips types only and
  // rejects that TypeScript-only shorthand (see apps/worker/src/worker.ts).
  readonly #redis: Redis;
  readonly #windowMs: number;

  constructor(redis: Redis, windowMs: number) {
    this.#redis = redis;
    this.#windowMs = windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      const [totalHits, ttlMs] = (await this.#redis.eval(
        INCREMENT_SCRIPT,
        1,
        key,
        this.#windowMs,
      )) as [number, number];
      // `exactOptionalPropertyTypes`: omit the key entirely rather than
      // set it to `undefined` when there is no reset time to report.
      return {
        totalHits,
        ...(ttlMs > 0 ? { resetTime: new Date(Date.now() + ttlMs) } : {}),
      };
    } catch (error) {
      // Redis unreachable: fail open rather than refuse every request
      // because a cache is down. See @velachess/infra-rate-limit's
      // provider throttle for the same call, made the same way.
      storeLogger.warn(
        { error, key },
        "redis rate limiter unreachable; allowing the request",
      );
      return { totalHits: 0 };
    }
  }

  async decrement(key: string): Promise<void> {
    await this.#redis.decr(key).catch(() => undefined);
  }

  async resetKey(key: string): Promise<void> {
    await this.#redis.del(key).catch(() => undefined);
  }
}
