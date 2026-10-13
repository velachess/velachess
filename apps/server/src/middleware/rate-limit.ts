/**
 * Rate limiting for the application's own routes, keyed by the
 * authenticated `userId` — not applied to `/auth/*` (Better Auth throttles
 * that itself) and not by client IP, so there is no proxy header to trust.
 *
 * `hono-rate-limiter` owns the counting/decision shape; `RedisRateLimitStore`
 * is the only piece swapped in, so the budgets, the 429 body, and the
 * `Retry-After` header stay exactly what they were under the Postgres
 * limiter this replaced.
 */
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";

import type { ApiEnv } from "../server.ts";
import type { ApiDeps } from "../deps.ts";
import { RedisRateLimitStore } from "./redis-rate-limit-store.ts";

export interface RateLimitPolicy {
  /** Namespaces the key, so one user's budgets never share a counter. */
  name: string;
  max: number;
  windowSeconds: number;
}

/** One budget per shape of cost: a list read and an import request differ
 * by orders of magnitude, and import also spends someone else's quota. */
export const POLICIES = {
  authenticated: { name: "api", max: 300, windowSeconds: 60 },
  import: { name: "import", max: 5, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

/** The resolved wait, read off the same `info` `hono-rate-limiter` already
 * computed from the store's `resetTime` — recomputed here, not read back
 * off a header, so the body and the header are guaranteed to agree without
 * depending on when each is written during the response. */
function retryAfterSeconds(resetTime: Date | undefined, windowSeconds: number): number {
  if (!resetTime) return windowSeconds;
  return Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
}

export function rateLimit(
  deps: Pick<ApiDeps, "redis">,
  policy: RateLimitPolicy,
  // Defaults to the whole user; a route budgeting a per-resource cost
  // (e.g. one account's sync) passes its own to avoid one resource's
  // traffic exhausting every other resource's budget.
  subject: (c: Context<ApiEnv>) => string = (c) => c.get("userId"),
) {
  const windowMs = policy.windowSeconds * 1000;
  const middleware = rateLimiter<ApiEnv>({
    windowMs,
    limit: policy.max,
    keyGenerator: (c) => `${policy.name}:${subject(c)}`,
    store: new RedisRateLimitStore(deps.redis, windowMs),
    // Enables `setRetryAfterHeader` internally; the `RateLimit-*` headers
    // it also sets are an addition no existing contract forbids.
    standardHeaders: "draft-7",
    handler: async (c, _next, options) => {
      // `rateLimit` is set dynamically by the library (its own source casts
      // past its context typing to do it) and never appears in `ApiEnv`'s
      // declared `Variables` — read through the untyped base `Context`.
      const info = (c as Context).get("rateLimit") as { resetTime?: Date } | undefined;
      const retryAfter = retryAfterSeconds(info?.resetTime, policy.windowSeconds);

      // Returned, not thrown: the SPA's client surfaces only status and
      // body on a rejection, never headers, so the wait belongs in the
      // body. `Retry-After` is still sent for non-SPA callers.
      c.header("Retry-After", String(retryAfter));
      return c.json(
        { error: "too many requests", retryAfterSeconds: retryAfter },
        options.statusCode as 429,
      );
    },
  });
  // Named so tests/openapi.test.ts can assert it is registered below the
  // session gate, since every policy is keyed by the userId it resolves.
  // `rateLimiter(...)` itself returns an anonymous middleware.
  return function rateLimited(c: Context<ApiEnv>, next: () => Promise<void>) {
    return middleware(c, next);
  };
}
