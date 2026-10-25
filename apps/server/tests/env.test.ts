// @vitest-environment node
import { describe, expect, it } from "vitest";

import { resolveApiEnv } from "../src/env.ts";
import { resolveRedisEnv } from "../src/redis.ts";

const CANARY = "leak-canary-0123456789";

const VALID = {
  DATABASE_URL: `postgres://velachess:${CANARY}@localhost:5434/velachess`,
  REDIS_URL: `redis://:${CANARY}@localhost:6380`,
  VELACHESS_AUTH_SECRET: "correct-horse-battery-staple-and-then-some",
};

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected a throw");
}

describe("resolveApiEnv", () => {
  it("resolves every integration from one environment", () => {
    const env = resolveApiEnv({
      ...VALID,
      PORT: "8080",
      VELACHESS_STORAGE_DIR: "/data",
      VELACHESS_BOOTSTRAP_USER_EMAIL: "first@velachess.local",
      VELACHESS_BOOTSTRAP_USER_PASSWORD: "first-user-password",
    });

    expect(env.databaseUrl).toBe(VALID.DATABASE_URL);
    expect(env.port).toBe(8080);
    expect(env.redis.url).toBe(VALID.REDIS_URL);
    expect(env.auth.baseUrl).toBe("http://localhost:3000");
    expect(env.storage.root).toBe("/data");
    expect(env.bootstrapCredentials).toEqual({
      email: "first@velachess.local",
      password: "first-user-password",
    });
  });

  it("defaults PORT to 3000 and leaves the bootstrap user unset", () => {
    const env = resolveApiEnv(VALID);

    expect(env.port).toBe(3000);
    expect(env.bootstrapCredentials).toBeNull();
    expect(env.email).toBeNull();
  });

  it("resolves email when Resend is configured", () => {
    const env = resolveApiEnv({
      ...VALID,
      RESEND_API_KEY: "re_live_key",
      VELACHESS_EMAIL_FROM: "VelaChess <no-reply@chess.example.com>",
    });

    expect(env.email).toEqual({
      apiKey: "re_live_key",
      from: "VelaChess <no-reply@chess.example.com>",
    });
  });

  it("refuses a magic link with no email to send it", () => {
    const error = errorOf(() =>
      resolveApiEnv({ ...VALID, VELACHESS_MAGIC_LINK: "true" }),
    );

    expect(error.message).toMatch(/VELACHESS_MAGIC_LINK.*RESEND_API_KEY/s);
  });

  it("turns a magic link on when Resend is configured", () => {
    const env = resolveApiEnv({
      ...VALID,
      VELACHESS_MAGIC_LINK: "true",
      RESEND_API_KEY: "re_live_key",
      VELACHESS_EMAIL_FROM: "VelaChess <no-reply@chess.example.com>",
    });

    expect(env.auth.magicLink).toBe(true);
  });

  it("refuses half an email configuration without echoing the key", () => {
    const error = errorOf(() => resolveApiEnv({ ...VALID, RESEND_API_KEY: CANARY }));

    expect(error.message).toMatch(/VELACHESS_EMAIL_FROM/);
    expect(error.message).not.toContain(CANARY);
  });

  it("requires DATABASE_URL", () => {
    const { DATABASE_URL: _omitted, ...env } = VALID;

    expect(() => resolveApiEnv(env)).toThrowError(/DATABASE_URL is required/);
  });

  it("rejects a DATABASE_URL that is not a postgres URL, without echoing it", () => {
    const error = errorOf(() =>
      resolveApiEnv({ ...VALID, DATABASE_URL: `mysql://root:${CANARY}@db/velachess` }),
    );

    expect(error.message).toMatch(
      /DATABASE_URL must be a postgres:\/\/ or postgresql:\/\/ URL/,
    );
    expect(error.message).not.toContain(CANARY);
  });

  it.each(["abc", "0", "70000", "3000.5", ""])("rejects PORT=%j", (port) => {
    expect(() => resolveApiEnv({ ...VALID, PORT: port })).toThrowError(
      /PORT must be an integer between 1 and 65535/,
    );
  });

  it("reports every invalid API variable at once", () => {
    const error = errorOf(() =>
      resolveApiEnv({ ...VALID, DATABASE_URL: "nope", PORT: "nope" }),
    );

    expect(error.message).toMatch(/DATABASE_URL/);
    expect(error.message).toMatch(/PORT/);
  });

  it("leaves auth rules to resolveAuthEnv, secret never echoed", () => {
    const error = errorOf(() =>
      resolveApiEnv({ ...VALID, VELACHESS_AUTH_SECRET: CANARY }),
    );

    expect(error.message).toMatch(/VELACHESS_AUTH_SECRET is too short/);
    expect(error.message).not.toContain(CANARY);
  });

  it("leaves storage rules to resolveStorageEnv", () => {
    expect(() =>
      resolveApiEnv({
        ...VALID,
        NODE_ENV: "production",
        VELACHESS_BASE_URL: "https://chess.example.com",
        VELACHESS_STORAGE_DIR: "relative/path",
      }),
    ).toThrowError(/VELACHESS_STORAGE_DIR must be an absolute path in production/);
  });

  it("leaves Redis rules to resolveRedisEnv", () => {
    const { REDIS_URL: _omitted, ...env } = VALID;

    expect(() => resolveApiEnv(env)).toThrowError(/REDIS_URL is required/);
  });
});

describe("resolveRedisEnv", () => {
  it.each(["redis://localhost:6380", "rediss://cache.example.com:6380/0"])(
    "accepts %s",
    (url) => {
      expect(resolveRedisEnv({ REDIS_URL: url })).toEqual({ url });
    },
  );

  it("requires REDIS_URL", () => {
    expect(() => resolveRedisEnv({})).toThrowError(/REDIS_URL is required/);
  });

  it("rejects a REDIS_URL that is not redis:// or rediss://, without echoing it", () => {
    const error = errorOf(() =>
      resolveRedisEnv({ REDIS_URL: `https://user:${CANARY}@cache.example.com` }),
    );

    expect(error.message).toMatch(/REDIS_URL must be a redis:\/\/ or rediss:\/\/ URL/);
    expect(error.message).not.toContain(CANARY);
  });
});
