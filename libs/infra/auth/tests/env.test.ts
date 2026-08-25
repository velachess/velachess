/**
 * The boot-time contract: what refuses to start, and what every refusal
 * says — and, just as deliberately, what it never says.
 *
 * Pure unit tests: `resolveAuthEnv` takes the environment as a value,
 * so each rule is provable without a process or a database.
 */
import { describe, expect, it } from "vitest";

import { resolveAuthEnv } from "../env.ts";

const STRONG = "correct-horse-battery-staple-and-then-some";

describe("the auth secret", () => {
  it("is required, and the error says how to make one", () => {
    expect(() => resolveAuthEnv({})).toThrowError(
      /VELACHESS_AUTH_SECRET is required.*openssl rand -base64 32/s,
    );
  });

  it("must be at least 32 characters", () => {
    expect(() => resolveAuthEnv({ VELACHESS_AUTH_SECRET: "short" })).toThrowError(
      /VELACHESS_AUTH_SECRET is too short.*at least 32/s,
    );
  });

  it("never appears in an error message", () => {
    const secret = "leak-canary-0123456789";
    try {
      resolveAuthEnv({ VELACHESS_AUTH_SECRET: secret });
      expect.unreachable("a short secret must throw");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).not.toContain("leak-canary");
    }
  });

  it("rejects the .env.example placeholder in production", () => {
    const env = {
      NODE_ENV: "production",
      VELACHESS_AUTH_SECRET: "change-me-to-a-random-32-character-secret",
      VELACHESS_BASE_URL: "https://chess.example.com",
    };
    expect(() => resolveAuthEnv(env)).toThrowError(/placeholder/);
    // Development tolerates it — .env.example must boot a dev machine.
    expect(resolveAuthEnv({ ...env, NODE_ENV: undefined }).secret).toBeTruthy();
  });
});

describe("the base URL", () => {
  it("defaults to localhost in development only", () => {
    const resolved = resolveAuthEnv({ VELACHESS_AUTH_SECRET: STRONG });
    expect(resolved.baseUrl).toBe("http://localhost:3000");
    expect(resolved.secureCookies).toBe(false);
    expect(resolved.insecureProductionTransport).toBe(false);
  });

  it("is required in production — no silent localhost", () => {
    expect(() =>
      resolveAuthEnv({ NODE_ENV: "production", VELACHESS_AUTH_SECRET: STRONG }),
    ).toThrowError(/VELACHESS_BASE_URL is required in production/);
  });

  it("rejects a value that is not an http(s) URL", () => {
    expect(() =>
      resolveAuthEnv({
        VELACHESS_AUTH_SECRET: STRONG,
        VELACHESS_BASE_URL: "not a url",
      }),
    ).toThrowError(/VELACHESS_BASE_URL is not a valid URL/);
    expect(() =>
      resolveAuthEnv({
        VELACHESS_AUTH_SECRET: STRONG,
        VELACHESS_BASE_URL: "ftp://chess.example.com",
      }),
    ).toThrowError(/must be http:\/\/ or https:\/\//);
  });
});

describe("cookie security follows the transport", () => {
  it("https means Secure cookies — with no switch to turn that off", () => {
    const resolved = resolveAuthEnv({
      NODE_ENV: "production",
      VELACHESS_AUTH_SECRET: STRONG,
      VELACHESS_BASE_URL: "https://chess.example.com",
    });
    expect(resolved.secureCookies).toBe(true);
    expect(resolved.insecureProductionTransport).toBe(false);
  });

  it("production over plain http is flagged for the boot log", () => {
    // Legal — a LAN self-host has no TLS — but never silent.
    const resolved = resolveAuthEnv({
      NODE_ENV: "production",
      VELACHESS_AUTH_SECRET: STRONG,
      VELACHESS_BASE_URL: "http://192.168.1.10:3000",
    });
    expect(resolved.secureCookies).toBe(false);
    expect(resolved.insecureProductionTransport).toBe(true);
  });
});

describe("trusted origins", () => {
  it("is the app's own origin unless widened deliberately", () => {
    const resolved = resolveAuthEnv({
      VELACHESS_AUTH_SECRET: STRONG,
      VELACHESS_BASE_URL: "https://chess.example.com/app",
    });
    expect(resolved.trustedOrigins).toEqual(["https://chess.example.com"]);
  });

  it("accepts a comma-separated widening, normalized to origins", () => {
    const resolved = resolveAuthEnv({
      VELACHESS_AUTH_SECRET: STRONG,
      VELACHESS_BASE_URL: "https://api.example.com",
      VELACHESS_TRUSTED_ORIGINS: " https://web.example.com , http://localhost:5173/ ",
    });
    expect(resolved.trustedOrigins).toEqual([
      "https://api.example.com",
      "https://web.example.com",
      "http://localhost:5173",
    ]);
  });

  it("names an invalid entry — origins are not secrets", () => {
    expect(() =>
      resolveAuthEnv({
        VELACHESS_AUTH_SECRET: STRONG,
        VELACHESS_TRUSTED_ORIGINS: "https://ok.example.com,not-an-origin",
      }),
    ).toThrowError(/VELACHESS_TRUSTED_ORIGINS.*not-an-origin/);
  });
});

describe("Google sign-in", () => {
  it("is simply absent when unconfigured", () => {
    expect(resolveAuthEnv({ VELACHESS_AUTH_SECRET: STRONG }).google).toBeUndefined();
  });

  it("is present when both halves are set", () => {
    const resolved = resolveAuthEnv({
      VELACHESS_AUTH_SECRET: STRONG,
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "client-secret",
    });
    expect(resolved.google).toEqual({
      clientId: "id.apps.googleusercontent.com",
      clientSecret: "client-secret",
    });
  });

  it("refuses to boot half-configured", () => {
    // Better Auth would accept an empty credential and fail later, at the
    // redirect — a broken button in production instead of a refusal here.
    for (const half of [
      { GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com" },
      { GOOGLE_CLIENT_SECRET: "client-secret" },
    ]) {
      expect(() =>
        resolveAuthEnv({ VELACHESS_AUTH_SECRET: STRONG, ...half }),
      ).toThrowError(/GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together/);
    }
  });

  it("never echoes the client secret in the refusal", () => {
    try {
      resolveAuthEnv({
        VELACHESS_AUTH_SECRET: STRONG,
        GOOGLE_CLIENT_SECRET: "leak-canary-google",
      });
      expect.unreachable("half-configured Google must throw");
    } catch (error) {
      expect((error as Error).message).not.toContain("leak-canary");
    }
  });
});

describe("trusted proxies", () => {
  it("is absent unless declared — a direct deployment has no proxy", () => {
    expect(
      resolveAuthEnv({ VELACHESS_AUTH_SECRET: STRONG }).trustedProxies,
    ).toBeUndefined();
  });

  it("parses a comma-separated list of addresses and ranges", () => {
    const resolved = resolveAuthEnv({
      VELACHESS_AUTH_SECRET: STRONG,
      VELACHESS_TRUSTED_PROXIES: " 127.0.0.1 , 10.0.0.0/8 ",
    });
    expect(resolved.trustedProxies).toEqual(["127.0.0.1", "10.0.0.0/8"]);
  });

  it("treats an empty value as unset rather than as an empty proxy", () => {
    const resolved = resolveAuthEnv({
      VELACHESS_AUTH_SECRET: STRONG,
      VELACHESS_TRUSTED_PROXIES: " , ",
    });
    expect(resolved.trustedProxies).toBeUndefined();
  });
});
