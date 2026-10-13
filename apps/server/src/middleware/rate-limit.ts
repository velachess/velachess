/**
 * Rate limiting for the application's own routes, keyed by the
 * authenticated `userId` — not applied to `/auth/*` (Better Auth throttles
 * that itself) and not by client IP, so there is no proxy header to trust.
 *
 * Fixed window (`hono-rate-limiter`'s `RedisStore`): the window opens on a
 * subject's first request and resets in full when it ends; refusals do not
 * extend it. See docs/explanation/apps/api.md.
 */
import type { Context, Next } from "hono";
import { rateLimiter } from "hono-rate-limiter";

import type { ApiEnv } from "../server.ts";
import type { ApiDeps } from "../deps.ts";
import { FailOpenRedisStore } from "./rate-limit-store.ts";

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

/** Never 0: a client told to wait zero seconds retries immediately. */
function retryAfterSeconds(resetTime: Date | undefined, windowSeconds: number): number {
  if (!resetTime) return windowSeconds;
  return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
}

export function rateLimit(
  deps: Pick<ApiDeps, "redis">,
  policy: RateLimitPolicy,
  // Defaults to the whole user; a route budgeting a per-resource cost
  // (e.g. one account's sync) passes its own to avoid one resource's
  // traffic exhausting every other resource's budget.
  subject: (c: Context<ApiEnv>) => string = (c) => c.get("userId"),
) {
  const limiter = rateLimiter<ApiEnv>({
    windowMs: policy.windowSeconds * 1000,
    limit: policy.max,
    keyGenerator: (c) => `${policy.name}:${subject(c)}`,
    store: new FailOpenRedisStore(deps.redis),
    standardHeaders: false,
    handler: (c) => {
      const retryAfter = retryAfterSeconds(
        c.get("rateLimit").resetTime,
        policy.windowSeconds,
      );
      // The SPA's client reads only the body of a rejection, so the wait goes
      // in both; one computed value keeps them equal.
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "too many requests", retryAfterSeconds: retryAfter }, 429);
    },
  });
  // Named so tests/openapi.test.ts can assert it is registered below the
  // session gate; `rateLimiter(...)` returns an anonymous middleware.
  return function rateLimited(c: Context<ApiEnv>, next: Next) {
    return limiter(c, next);
  };
}
