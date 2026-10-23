/**
 * A security option silently not passed through behaves exactly like a
 * configured one until it is needed, which is what these pin.
 *
 * Better Auth's limiter is off outside production, so its behaviour cannot
 * be exercised from a test process: its bucket-keying is the library's to
 * prove, ours is that the options reach it.
 */
import { describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";

import { createAuth } from "../auth.ts";

/** Never queried: the Drizzle adapter is lazy. */
const db = {} as Database;

const base = {
  db,
  baseUrl: "https://chess.example.com",
  secret: "test-secret-at-least-32-characters-long",
  secureCookies: true,
};

describe("rate limiting", () => {
  it("is stored in the database, under our table", () => {
    // The default is per-instance process memory, reset by every deploy.
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
    // Better Auth reads an unset list as "the socket address is the
    // client", which an empty one does not say.
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
    // `disableSignUp` governs emailAndPassword only, which is what opens
    // public sign-up without an SMTP dependency.
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
    // Reached when no recoverable state carries a caller's own
    // errorCallbackURL. Unset, it is baseURL + basePath + "/error", a path
    // the SPA never routes.
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

/**
 * The avatar lifecycle rests on Better Auth writing `user.image` at user
 * creation and never again, so enabling either flag below would restore a
 * provider picture over an uploaded avatar, or over a deliberate removal.
 *
 * In the installed 1.7.2, `api/routes/callback.mjs:232` gates the sign-in
 * overwrite on `overrideUserInfoOnSignIn` and `oauth2/link-account.mjs:320`
 * the link-time one on `accountLinking.updateUserInfoOnLink`. Neither can
 * be driven without a real token exchange, so the option is the seam.
 */
describe("who owns user.image", () => {
  // Whole objects rather than one absent key each: a test naming a key
  // would not compile while it is absent, and would stop guarding the
  // moment it appeared. An exhaustive match fails on any added option.
  it("passes Google no option that could overwrite user.image on sign-in", () => {
    const { options } = createAuth({
      ...base,
      google: { clientId: "client-id", clientSecret: "client-secret" },
    });

    expect(options.socialProviders?.google).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectURI: "https://chess.example.com/api/auth/callback/google",
    });
  });

  it("passes no account-linking option that could overwrite it either", () => {
    const { options } = createAuth(base);

    expect(options.account).toEqual({ modelName: "authAccounts" });
  });
});
