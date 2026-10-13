/**
 * The Redis connection every rate limiter in this system shares: the API's
 * inbound budgets (`apps/server`) and the worker's per-provider admission
 * control (`apps/worker`) are both latency-sensitive paths that must not
 * block on a slow or dead Redis — a rate limiter that can hang the request
 * it is supposed to be cheap to check has the problem backwards.
 *
 * `maxRetriesPerRequest: 1` is what makes that true: a command fails fast
 * after one retry instead of queuing behind ioredis's own reconnect loop,
 * so a caller's fail-open catch triggers promptly rather than piling up
 * pending commands against a Redis that is still down. The offline queue
 * stays on (ioredis's default) — turning it off also breaks the ordinary
 * case of a command issued the instant after construction, before the
 * first connection finishes, not just a genuine outage.
 * `rediss://` (TLS) and `redis://` are both read straight from the URL.
 */
import { Redis } from "ioredis";

export function createRedisClient(
  url: string,
  opts: {
    /**
     * For a client pointed at an endpoint that is expected to never come
     * up (a test harness's placeholder when no real Redis is configured) —
     * one failed connection attempt and ioredis stops retrying, so every
     * command after the first rejects immediately instead of each one
     * separately waiting out `connectTimeout`/`commandTimeout`. Never set
     * this on a real deployment's client: a transient outage should keep
     * trying to reconnect, not give up for the rest of the process.
     */
    disableReconnect?: boolean;
  } = {},
): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
    ...(opts.disableReconnect ? { retryStrategy: () => null } : {}),
  });
}

export type { Redis };
