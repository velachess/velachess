// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rateLimit, type RateLimitPolicy } from "../src/middleware/rate-limit.ts";
import { createRedisClient, type Redis } from "../src/redis.ts";
import { unreachableRedis } from "./harness.ts";
import type { ApiEnv } from "../src/server.ts";

const url = process.env["REDIS_URL"];

function appWith(redis: Redis, policy: RateLimitPolicy, userId: string) {
  return new Hono<ApiEnv>()
    .use(async (c, next) => {
      c.set("userId", userId);
      await next();
    })
    .use(rateLimit({ redis }, policy))
    .get("/", (c) => c.text("ok"));
}

const policyOf = (max: number, windowSeconds: number): RateLimitPolicy => ({
  name: `test-${randomUUID()}`,
  max,
  windowSeconds,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!url)("rate limit middleware over Redis", () => {
  let redis: Redis;

  beforeAll(() => {
    redis = createRedisClient(url ?? "");
  });

  afterAll(() => {
    redis.disconnect();
  });

  it("refuses past the budget, with the same wait in the body and the header", async () => {
    const policy = policyOf(2, 60);
    const userId = randomUUID();
    const app = appWith(redis, policy, userId);

    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(200);
    const refused = await app.request("/");

    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.error).toBe("too many requests");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(policy.windowSeconds);
    expect(Number(refused.headers.get("retry-after"))).toBe(body.retryAfterSeconds);
  });

  it("counts in hono-rate-limiter's own key space, under a key that expires with the window", async () => {
    const policy = policyOf(5, 60);
    const userId = randomUUID();

    await appWith(redis, policy, userId).request("/");

    const ttlMs = await redis.pttl(`hrl:${policy.name}:${userId}`);
    expect(ttlMs).toBeGreaterThan(0);
    expect(ttlMs).toBeLessThanOrEqual(policy.windowSeconds * 1000);
  });

  it("is a fixed window: refusals do not extend it, and it reopens in full when it ends", async () => {
    const policy = policyOf(2, 1);
    const userId = randomUUID();
    const app = appWith(redis, policy, userId);
    const key = `hrl:${policy.name}:${userId}`;

    await app.request("/");
    await app.request("/");
    expect((await app.request("/")).status).toBe(429);
    const ttlAtFirstRefusal = await redis.pttl(key);

    await sleep(300);
    expect((await app.request("/")).status).toBe(429);
    expect(await redis.pttl(key)).toBeLessThan(ttlAtFirstRefusal);

    await sleep(ttlAtFirstRefusal);
    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(429);
  });

  it("fails open when Redis is unreachable", async () => {
    const unreachable = unreachableRedis();
    try {
      const app = appWith(unreachable, policyOf(1, 60), randomUUID());

      expect((await app.request("/")).status).toBe(200);
      expect((await app.request("/")).status).toBe(200);
    } finally {
      unreachable.disconnect();
    }
  });
});
