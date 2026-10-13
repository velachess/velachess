/**
 * Minimum spacing between calls to one key, shared across every process
 * holding the same Redis — the piece neither pg-boss's `groupConcurrency`
 * (one job per provider at a time, globally, but says nothing about the
 * gap between one job's last call and the next job's first) nor its retry
 * policy (job-level backoff, not inter-call spacing) can express. See
 * `apps/worker/src/composition/accounts.ts` for how this and
 * `groupConcurrency` divide the "at most one, no faster than every N ms"
 * requirement between them.
 *
 * One atomic script: read the server clock, compare it to the key's last
 * accepted timestamp, and only write a new one when the interval has
 * passed. `PX` makes every key a lease that expires on its own — never a
 * permanent lock a dead process could leave held.
 */
import { Redis } from "ioredis";

import { logger } from "@velachess/infra-logger";

const throttleLogger = logger.child({ component: "provider-throttle" });

export interface ThrottleVerdict {
  allowed: boolean;
  /** Whole seconds until the interval clears. 0 when allowed. */
  retryAfterSeconds: number;
}

// KEYS[1] = key, ARGV[1] = minimum interval in ms.
// `redis.call('TIME')` is the server's own clock — every caller agrees on
// it regardless of its own clock skew, the same reason the old Postgres
// limiter read `now()` instead of the application's `Date.now()`.
const THROTTLE_SCRIPT = `
local last = tonumber(redis.call('GET', KEYS[1]))
local time = redis.call('TIME')
local now_ms = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local interval_ms = tonumber(ARGV[1])

if last == nil or (now_ms - last) >= interval_ms then
  redis.call('SET', KEYS[1], now_ms, 'PX', interval_ms * 2)
  return {1, 0}
end

return {0, interval_ms - (now_ms - last)}
`;

/**
 * `// ponytail:` the script is sent in full on every call rather than
 * cached via `defineCommand`/EVALSHA — a few lines of Lua costs nothing
 * next to the network call it gates. Switch to `defineCommand` only if
 * profiling ever shows script transfer, not the HTTP call it precedes,
 * dominating.
 */
export async function consumeProviderInterval(
  redis: Redis,
  key: string,
  minIntervalMs: number,
): Promise<ThrottleVerdict> {
  try {
    const [allowed, retryAfterMs] = (await redis.eval(
      THROTTLE_SCRIPT,
      1,
      key,
      minIntervalMs,
    )) as [number, number];
    return {
      allowed: allowed === 1,
      retryAfterSeconds: allowed === 1 ? 0 : Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  } catch (error) {
    // Redis unreachable: fail open. A provider throttle exists to be a
    // good citizen of someone else's API, not to gate our own — losing it
    // for the length of an outage costs nothing but politeness, while
    // refusing every sync because a cache is down costs availability for
    // a problem this mechanism was never meant to guard.
    throttleLogger.warn(
      { error, key },
      "provider throttle unreachable; allowing the call",
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
