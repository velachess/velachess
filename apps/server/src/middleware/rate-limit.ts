/**
 * Rate limiting for the application's own routes, keyed by the
 * authenticated `userId` — not applied to `/auth/*` (Better Auth throttles
 * that itself) and not by client IP, so there is no proxy header to trust.
 */

import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { consumeRateLimit, type RateLimitPolicy } from "@velachess/infra-db";

import type { ApiEnv } from "../server.ts";
import type { ApiDeps } from "../deps.ts";

/** One budget per shape of cost: a list read and an analysis request differ
 * by orders of magnitude, and import also spends someone else's quota. */
export const POLICIES = {
  authenticated: { name: "api", max: 300, windowSeconds: 60 },
  import: { name: "import", max: 5, windowSeconds: 60 },
  expensive: { name: "analysis", max: 20, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

export function rateLimit(
  deps: ApiDeps,
  policy: RateLimitPolicy,
  // Defaults to the whole user; a route budgeting a per-resource cost
  // (e.g. one account's sync) passes its own to avoid one resource's
  // traffic exhausting every other resource's budget.
  subject: (c: Context<ApiEnv>) => string = (c) => c.get("userId"),
) {
  // Named so tests/openapi.test.ts can assert it is registered below
  // the session gate, since every policy is keyed by the userId it resolves.
  return createMiddleware<ApiEnv>(async function rateLimited(c, next) {
    const verdict = await consumeRateLimit(deps.db, subject(c), policy);

    if (!verdict.allowed) {
      // Returned, not thrown: the SPA's client surfaces only status and
      // body on a rejection, never headers, so the wait belongs in the
      // body. `Retry-After` is still sent for non-SPA callers.
      return c.json(
        {
          error: "too many requests",
          retryAfterSeconds: verdict.retryAfterSeconds,
        },
        429,
        { "Retry-After": String(verdict.retryAfterSeconds) },
      );
    }

    await next();
  });
}
