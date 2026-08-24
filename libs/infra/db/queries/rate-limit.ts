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

interface Row {
  count: number;
  retry_after: number;
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

  // A single statement so concurrent requests cannot all read a stale count
  // before any increment lands. The CASE arms are, in order: the window
  // expired (start over), there is budget left (spend it), or we are over
  // the limit (touch nothing, so the wait is measured from the last
  // request we actually accepted).
  //
  // The counter saturates at `max + 1`, one past the budget, and that extra
  // step is what makes the verdict readable: a count that stopped AT `max`
  // is indistinguishable from a request that just spent the last unit.
  // `last_request` advances only on an accepted request, so a client that
  // keeps hammering never extends its own lockout.
  const result = await db.execute(sql`
    INSERT INTO rate_limits AS r (key, count, last_request)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN r.last_request < now() - ${window} THEN 1
        WHEN r.count <= ${policy.max}           THEN r.count + 1
        ELSE r.count
      END,
      last_request = CASE
        WHEN r.last_request < now() - ${window} OR r.count < ${policy.max} THEN now()
        ELSE r.last_request
      END
    RETURNING
      count,
      GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (last_request + ${window} - now())))
      )::int AS retry_after
  `);

  // The drivers disagree on the shape of a raw result: postgres-js returns
  // the rows themselves, PGlite returns `{ rows }`. Normalized here so the
  // limiter behaves identically under the test database and under
  // production's — a silent `undefined` would read as "allowed".
  const rows = Array.isArray(result) ? result : (result as { rows: Row[] }).rows;
  const row = (rows as Row[])[0] ?? { count: 1, retry_after: 0 };
  const allowed = Number(row.count) <= policy.max;

  return {
    allowed,
    // A blocked caller is told when the window frees up; an allowed one has
    // nothing to wait for, and saying otherwise would invite a client to
    // sleep for no reason.
    retryAfterSeconds: allowed ? 0 : Math.max(1, Number(row.retry_after)),
  };
}
