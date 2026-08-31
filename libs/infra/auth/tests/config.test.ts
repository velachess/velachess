/**
 * What the config actually hands to Better Auth. These assertions look
 * modest, and they are the only cheap way to catch the failure mode that
 * matters here: a security option that is silently *not* passed through
 * behaves exactly like a correctly configured one until it is needed.
 *
 * Better Auth's own limiter is off outside production
 * (`enabled: options.rateLimit?.enabled ?? isProduction` in its context
 * builder), so its behaviour cannot be exercised from a test process. Its
 * chain-stripping and bucket-keying are the library's to prove; ours is
 * that the options reach it.
 */
import { describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";

import { createAuth } from "../auth.ts";

/** Never queried: the Drizzle adapter is lazy, and nothing here signs in. */
const db = {} as Database;

const base = {
  db,
  baseUrl: "https://chess.example.com",
  secret: "test-secret-at-least-32-characters-long",
  secureCookies: true,
};

describe("rate limiting", () => {
  it("is stored in the database, under our table", () => {
    // The default is process memory: per-instance, and reset by every
    // deploy. A limit that forgets on restart is not a limit.
    const { options } = createAuth(base);
    expect(options.rateLimit).toEqual({
      storage: "database",
      modelName: "authRateLimits",
    });
  });
});

describe("trusted proxies", () => {
  it("reach Better Auth's IP resolution when declared", () => {
    const { options } = createAuth({ ...base, trustedProxies: ["10.0.0.0/8"] });
    expect(options.advanced?.ipAddress?.trustedProxies).toEqual(["10.0.0.0/8"]);
  });

  it("are absent, not empty, when not declared", () => {
    // An empty list is not the same statement as "no proxies": Better Auth
    // reads an unset list as "the socket address is the client".
    const { options } = createAuth(base);
    expect(options.advanced?.ipAddress).toBeUndefined();
  });
});

describe("Google sign-in", () => {
  it("is offered only when credentials are configured", () => {
    expect(createAuth(base).options.socialProviders?.google).toBeUndefined();

    const configured = createAuth({
      ...base,
      google: { clientId: "id", clientSecret: "secret" },
    });
    expect(configured.options.socialProviders?.google).toMatchObject({
      clientId: "id",
      clientSecret: "secret",
    });
  });

  it("is independent of the password sign-up switch", () => {
    // The one that opens public sign-up without an SMTP dependency:
    // `disableSignUp` governs emailAndPassword only.
    const { options } = createAuth({
      ...base,
      google: { clientId: "id", clientSecret: "secret" },
    });
    expect(options.emailAndPassword?.disableSignUp).toBe(true);
    expect(options.socialProviders?.google).toBeDefined();
  });
});

describe("the OAuth error fallback", () => {
  it("points at the sign-in screen, not Better Auth's own /auth/error", () => {
    // Reached only when there's no recoverable state to carry a caller's
    // own errorCallbackURL — a state_mismatch or a malformed callback
    // request. Left unset, this is baseURL + basePath + "/error", a
    // path the SPA never routes.
    const { options } = createAuth(base);
    expect(options.onAPIError?.errorURL).toBe("https://chess.example.com/login");
  });
});

describe("cookies", () => {
  it("follow the configured transport, with no production override", () => {
    expect(createAuth(base).options.advanced?.useSecureCookies).toBe(true);
    expect(
      createAuth({ ...base, secureCookies: false }).options.advanced?.useSecureCookies,
    ).toBe(false);
  });
});
