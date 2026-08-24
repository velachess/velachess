/**
 * Rate limiting for the application's own routes.
 *
 * Deliberately NOT applied to `/auth/*`. Better Auth ships its own limiter
 * with stricter built-in rules for the sensitive endpoints (`/sign-in*`,
 * `/sign-up*`, password reset and friends), and it is configured here with
 * `storage: "database"` so it is distributed too. Putting a second limiter
 * in front of it would duplicate the protection and split the accounting
 * across two tables that disagree.
 *
 * There is also no client-IP resolution here, and that is the point: every
 * policy below is keyed by `userId`, which the session already proved. No
 * `X-Forwarded-For` parsing means no trusted-proxy list to get wrong and no
 * header a client can forge to escape its own limit. The two public routes
 * — `/health` and `/openapi.json` — are cheap and static; crude anonymous
 * abuse belongs to the reverse proxy, not to a database round-trip.
 */

import { createMiddleware } from "hono/factory";

import { consumeRateLimit, type RateLimitPolicy } from "@velachess/db";

import type { ApiEnv } from "../server.ts";
import type { ApiDeps } from "../deps.ts";

/**
 * One budget per shape of cost, not one budget for "the API".
 *
 * A read of the games list and a request to analyse one differ by four
 * orders of magnitude in what they ask of the machine, so they cannot
 * share a counter. `import` is stricter still because it also spends
 * somebody else's quota — chess.com's and Lichess's.
 */
export const POLICIES = {
  authenticated: { name: "api", max: 300, windowSeconds: 60 },
  import: { name: "import", max: 5, windowSeconds: 60 },
  expensive: { name: "analysis", max: 20, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

export function rateLimit(deps: ApiDeps, policy: RateLimitPolicy) {
  // Named for the same reason as the session gate: it must be provably
  // registered after it, since every policy is keyed by the userId the
  // session resolves.
  return createMiddleware<ApiEnv>(async function rateLimited(c, next) {
    const verdict = await consumeRateLimit(deps.db, c.get("userId"), policy);

    if (!verdict.allowed) {
      // Returned, not thrown — the same pattern as the sync cooldown in
      // routes/accounts.ts, and for the same reason: the wait belongs in
      // the BODY. The SPA's client (hono's `parseResponse`) surfaces only
      // status and body of a rejection, never headers, so a wait that
      // lived in `Retry-After` alone would be invisible to the UI.
      //
      // The header is still sent for everything that is not our SPA —
      // it is the standard, and curl and proxies read it. Better Auth
      // answers its own throttling with `X-Retry-After` instead; that
      // asymmetry is the library's, not a slip here.
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
