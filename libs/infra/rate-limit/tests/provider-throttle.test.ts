// @vitest-environment node
/**
 * The spacing primitive's arithmetic, proved against a real Redis rather
 * than reasoned about — same policy as the Postgres limiter it replaced
 * (docs/how-to/write-a-test.md: neither half of this repo mocks the thing
 * it is meant to be checking). Requires `REDIS_URL`; CI's Redis job runs
 * it, same pattern as `libs/infra/db/tests/concurrency.test.ts`.
 */
import { afterAll, describe, expect, it } from "vitest";

import { createRedisClient, consumeProviderInterval } from "../index.ts";

const url = process.env["REDIS_URL"];

describe.skipIf(!url)("consumeProviderInterval", () => {
  const redis = createRedisClient(url!);
  afterAll(() => redis.quit());

  it("allows the first call, then refuses until the interval passes", async () => {
    const key = `test:${crypto.randomUUID()}`;

    expect(await consumeProviderInterval(redis, key, 500)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });

    const refused = await consumeProviderInterval(redis, key, 500);
    expect(refused.allowed).toBe(false);
    // Never zero: a caller told to retry in 0s retries immediately, which
    // is the behaviour the refusal exists to prevent.
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await consumeProviderInterval(redis, key, 500)).toMatchObject({
      allowed: true,
    });
  });

  it("gives every key its own clock", async () => {
    const chessCom = `test:${crypto.randomUUID()}`;
    const lichess = `test:${crypto.randomUUID()}`;

    expect((await consumeProviderInterval(redis, chessCom, 500)).allowed).toBe(true);
    expect((await consumeProviderInterval(redis, chessCom, 500)).allowed).toBe(false);
    // chessCom being throttled says nothing about lichess's own key.
    expect((await consumeProviderInterval(redis, lichess, 500)).allowed).toBe(true);
  });

  it("the key is a lease, not a permanent lock: it expires on its own", async () => {
    const key = `test:${crypto.randomUUID()}`;
    await consumeProviderInterval(redis, key, 200);

    const ttlMs = await redis.pttl(key);
    // Set to 2x the interval; never unset (-1) and never already gone (-2).
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(400);
  });

  it("fails open when Redis is unreachable, rather than blocking every call", async () => {
    const unreachable = createRedisClient("redis://127.0.0.1:1");
    try {
      const verdict = await consumeProviderInterval(unreachable, "test:unreachable", 500);
      expect(verdict).toEqual({ allowed: true, retryAfterSeconds: 0 });
    } finally {
      unreachable.disconnect();
    }
  });
});
