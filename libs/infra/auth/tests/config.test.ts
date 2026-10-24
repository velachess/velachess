import { describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";

import { createAuth } from "../auth.ts";

const db = {} as Database;

const base = {
  db,
  baseUrl: "https://chess.example.com",
  secret: "test-secret-at-least-32-characters-long",
  secureCookies: true,
};

describe("rate limiting", () => {
  it("is stored in the database, under our table", () => {
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

describe("who owns user.image", () => {
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

const sendEmail = async () => {};

describe("email", () => {
  it("is absent without a sender, so sign-in stays as it was", () => {
    const { options } = createAuth(base);
    expect(options.emailAndPassword?.sendResetPassword).toBeUndefined();
    expect(options.emailAndPassword?.requireEmailVerification).toBeUndefined();
    expect(options.emailVerification).toBeUndefined();
  });

  it("with a sender, verifies addresses and revokes sessions on reset", () => {
    const { options } = createAuth({ ...base, sendEmail });
    expect(options.emailAndPassword).toMatchObject({
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      disableSignUp: true,
    });
    expect(options.emailVerification).toMatchObject({
      sendOnSignUp: true,
      sendOnSignIn: true,
    });
  });
});
