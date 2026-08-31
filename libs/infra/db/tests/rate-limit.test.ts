// @vitest-environment node
/**
 * The limiter's arithmetic, proved against a real Postgres rather than
 * reasoned about: budgets are per (policy, subject), a refusal reports a
 * usable wait, and an expired window starts over instead of staying shut.
 */
import { sql } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { consumeRateLimit, type RateLimitPolicy } from "@velachess/infra-db";

import { createTestDb } from "./test-db.ts";

const { db, close } = await createTestDb();
afterAll(close);

const policy = (over: Partial<RateLimitPolicy> = {}): RateLimitPolicy => ({
  name: "test",
  max: 3,
  windowSeconds: 60,
  ...over,
});

it("spends exactly `max` requests, then refuses", async () => {
  const rule = policy({ name: "spend" });

  for (let i = 0; i < rule.max; i++) {
    expect(await consumeRateLimit(db, "alice", rule)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  }

  const refused = await consumeRateLimit(db, "alice", rule);
  expect(refused.allowed).toBe(false);
  // Never zero: a client told to retry in 0s retries immediately, which is
  // the behaviour the refusal exists to prevent.
  expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  expect(refused.retryAfterSeconds).toBeLessThanOrEqual(rule.windowSeconds);
});

it("gives every subject its own budget", async () => {
  const rule = policy({ name: "subjects", max: 1 });

  expect((await consumeRateLimit(db, "bob", rule)).allowed).toBe(true);
  expect((await consumeRateLimit(db, "bob", rule)).allowed).toBe(false);
  // Bob being over his limit says nothing about Carol.
  expect((await consumeRateLimit(db, "carol", rule)).allowed).toBe(true);
});

it("gives every policy its own budget for the same subject", async () => {
  const cheap = policy({ name: "cheap", max: 1 });
  const costly = policy({ name: "costly", max: 1 });

  expect((await consumeRateLimit(db, "dave", cheap)).allowed).toBe(true);
  expect((await consumeRateLimit(db, "dave", cheap)).allowed).toBe(false);
  // Exhausting the cheap budget must not close the costly one — the keys
  // are namespaced by policy name, not shared per user.
  expect((await consumeRateLimit(db, "dave", costly)).allowed).toBe(true);
});

it("reopens once the window has passed", async () => {
  // A one-second window, so the test waits rather than mocks the clock:
  // `now()` here is Postgres's, and a faked JS clock would prove nothing.
  const rule = policy({ name: "window", max: 1, windowSeconds: 1 });

  expect((await consumeRateLimit(db, "erin", rule)).allowed).toBe(true);
  expect((await consumeRateLimit(db, "erin", rule)).allowed).toBe(false);

  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect((await consumeRateLimit(db, "erin", rule)).allowed).toBe(true);
});

it("keeps a blocked caller's wait measured from the last accepted request", async () => {
  // The rejected attempt must not push `last_request` forward — otherwise
  // a client that keeps retrying extends its own lockout indefinitely.
  const rule = policy({ name: "no-extend", max: 1, windowSeconds: 10 });

  await consumeRateLimit(db, "frank", rule);
  const first = await consumeRateLimit(db, "frank", rule);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const later = await consumeRateLimit(db, "frank", rule);

  expect(first.allowed).toBe(false);
  expect(later.allowed).toBe(false);
  expect(later.retryAfterSeconds).toBeLessThan(first.retryAfterSeconds);
});

it("holds one row per key however many requests arrive", async () => {
  const rule = policy({ name: "rows", max: 2, windowSeconds: 1 });

  for (let i = 0; i < 6; i++) {
    await consumeRateLimit(db, "grace", rule);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // The reason this table needs no pruning: rows are bounded by subjects,
  // not by elapsed windows.
  // Same driver divergence the query layer normalizes: postgres-js hands
  // back the rows, PGlite hands back `{ rows }`.
  const result = (await db.execute(
    sql`select count(*)::int as n from rate_limits where key = ${"rows:grace"}`,
  )) as unknown as { n: number }[] | { rows: { n: number }[] };
  const rows = Array.isArray(result) ? result : result.rows;
  expect(Number(rows[0]!.n)).toBe(1);
});
