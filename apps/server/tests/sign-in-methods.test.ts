// @vitest-environment node
import { describe, expect, it } from "vitest";

import { bootstrapUser } from "@velachess/user";

import { buildBootstrapUserDeps } from "../src/composition/user.ts";
import { createApiHarness, type ApiHarness } from "./harness.ts";

const GOOGLE = { clientId: "client-id", clientSecret: "client-secret" };
const sendEmail = () => Promise.resolve();

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function withHarness(
  methods: Parameters<typeof createApiHarness>[1],
  run: (harness: ApiHarness) => Promise<void>,
) {
  const harness = await createApiHarness(undefined, methods);
  try {
    await run(harness);
  } finally {
    await harness.close();
  }
}

describe("GET /config", () => {
  it.each([
    [
      "password alone",
      {},
      { password: true, passwordReset: false, google: false, magicLink: false },
    ],
    [
      "password with email",
      { sendEmail },
      { password: true, passwordReset: true, google: false, magicLink: false },
    ],
    [
      "password and Google",
      { google: GOOGLE },
      { password: true, passwordReset: false, google: true, magicLink: false },
    ],
    [
      "Google and a magic link, password off",
      { google: GOOGLE, sendEmail, magicLink: true, passwordSignIn: false },
      { password: false, passwordReset: false, google: true, magicLink: true },
    ],
  ])("reports what Better Auth runs with: %s", async (_name, methods, expected) => {
    await withHarness(methods, async (harness) => {
      const response = await harness.app.request("/config");
      expect(await response.json()).toEqual({ signInMethods: expected });
    });
  });
});

describe("password sign-in turned off", () => {
  it("refuses a password, still offers Google, and bootstrap still provisions", async () => {
    await withHarness({ google: GOOGLE, passwordSignIn: false }, async (harness) => {
      const credentials = { email: "first@velachess.local", password: "first-password" };
      const bootstrap = await bootstrapUser(
        buildBootstrapUserDeps(harness.db, harness.bootstrapAuth, harness.lock),
        credentials,
      );
      expect(bootstrap.status).toBe("created");

      const refused = await harness.app.request("/auth/sign-in/email", post(credentials));
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ code: "EMAIL_PASSWORD_DISABLED" });
      expect(refused.headers.get("set-cookie")).toBeNull();

      const google = await harness.app.request(
        "/auth/sign-in/social",
        post({ provider: "google", callbackURL: "/" }),
      );
      expect(google.status).toBe(200);
    });
  });
});

describe("public password registration", () => {
  it("stays closed with email and a magic link configured", async () => {
    await withHarness({ sendEmail, magicLink: true }, async (harness) => {
      const response = await harness.app.request(
        "/auth/sign-up/email",
        post({
          name: "Mallory",
          email: "mallory@example.com",
          password: "mallory-pw-123",
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
      });
    });
  });
});
