/**
 * The API's rate limiter, as one atomic statement.
 *
 * Postgres is the arbiter rather than process memory, so the limit holds
 * across however many API instances are running — an in-memory counter is
 * per-instance and resets on deploy, which is a limit that lies.
 *
 * The window is not a fixed calendar minute, and that is deliberate: it
 * copies Better Auth's semantics so the two limiters in this system behave
 * the same way. `last_request` advances on every ALLOWED request and stays
 * put while blocking, so the rule reads: at most `max` requests, then wait
 * `window` from your last accepted one.
 *
 * One row per key, updated in place. The row count is bounded by the number
 * of users, not by elapsed time, so there is nothing to prune — which is
 * why this is not `(key, window_start)`.
 */

import { sql } from "drizzle-orm";

import type { Database } from "../client.ts";
import { rateLimits } from "../schema.ts";

export interface RateLimitPolicy {
  /** Namespaces the key, so one user's budgets never share a counter. */
  name: string;
  max: number;
  windowSeconds: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Whole seconds until the window frees up. 0 when allowed. */
  retryAfterSeconds: number;
}

export async function consumeRateLimit(
  db: Database,
  subject: string,
  policy: RateLimitPolicy,
): Promise<RateLimitVerdict> {
  const key = `${policy.name}:${subject}`;
  // Bound as a parameter rather than interpolated into an interval literal:
  // the value is ours today, and a query that cannot be made to lie is
  // cheaper than remembering that it must not be.
  const window = sql`make_interval(secs => ${policy.windowSeconds})`;

  // The query builder, not db.execute(): its .returning() normalizes the
  // row shape across drivers (postgres-js vs PGlite) on its own, which is
  // the ORM's job, not this function's. Unqualified column references in
  // the CASE arms below (rateLimits.count etc.) already mean "the row
  // before this statement" — that's Postgres's ON CONFLICT DO UPDATE
  // semantics, not something the query needs to alias for.
  //
  // The CASE arms are, in order: the window expired (start over), there is
  // budget left (spend it), or we are over the limit (touch nothing, so the
  // wait is measured from the last request we actually accepted).
  //
  // The counter saturates at `max + 1`, one past the budget, and that extra
  // step is what makes the verdict readable: a count that stopped AT `max`
  // is indistinguishable from a request that just spent the last unit.
  // `last_request` advances only on an accepted request, so a client that
  // keeps hammering never extends its own lockout.
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, lastRequest: sql`now()` })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE
          WHEN ${rateLimits.lastRequest} < now() - ${window} THEN 1
          WHEN ${rateLimits.count} <= ${policy.max}          THEN ${rateLimits.count} + 1
          ELSE ${rateLimits.count}
        END`,
        lastRequest: sql`CASE
          WHEN ${rateLimits.lastRequest} < now() - ${window} OR ${rateLimits.count} < ${policy.max}
            THEN now()
          ELSE ${rateLimits.lastRequest}
        END`,
      },
    })
    .returning({
      count: rateLimits.count,
      // A blocked caller is told when the window frees up; an allowed one
      // has nothing to wait for, and saying otherwise would invite a
      // client to sleep for no reason.
      retryAfterSeconds: sql<number>`GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (${rateLimits.lastRequest} + ${window} - now())))
      )::int`,
    });

  const allowed = row!.count <= policy.max;

  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.max(1, row!.retryAfterSeconds),
  };
}
