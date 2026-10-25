// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { schema } from "@velachess/infra-db";

import { createApiHarness, type ApiHarness } from "./harness.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

let harness: ApiHarness;

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(async () => {
  await harness.close();
});

const games = (cookie: string) => harness.app.request("/games", { headers: { cookie } });

async function sessionOf(cookie: string) {
  const token = decodeURIComponent(cookie.split("=")[1]!).split(".")[0]!;
  const [session] = await harness.db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.token, token));
  return session;
}

async function setExpiry(cookie: string, expiresAt: Date) {
  const session = await sessionOf(cookie);
  await harness.db
    .update(schema.sessions)
    .set({ expiresAt })
    .where(eq(schema.sessions.id, session!.id));
}

describe("session lifetime", () => {
  it("lasts seven days from sign-in", async () => {
    const { cookie } = await harness.signUp("seven-days@example.com");
    const session = await sessionOf(cookie);
    expect(session!.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      7 * DAY_MS - 60_000,
    );
    expect(session!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(7 * DAY_MS);
  });

  it("ends at its expiry: the same cookie is nobody", async () => {
    const { cookie } = await harness.signUp("expired@example.com");
    await setExpiry(cookie, new Date(Date.now() - 1000));

    expect((await games(cookie)).status).toBe(401);
  });

  it("is left alone within a day of its last refresh", async () => {
    const { cookie } = await harness.signUp("fresh@example.com");
    const before = await sessionOf(cookie);

    const response = await harness.app.request("/auth/get-session", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect((await sessionOf(cookie))!.expiresAt).toEqual(before!.expiresAt);
  });

  it("is extended to seven days once a day has passed, and the cookie with it", async () => {
    const { cookie } = await harness.signUp("refreshed@example.com");
    const staleExpiry = new Date(Date.now() + 6 * DAY_MS - 60_000);
    await setExpiry(cookie, staleExpiry);

    const response = await harness.app.request("/auth/get-session", {
      headers: { cookie },
    });

    const refreshed = await sessionOf(cookie);
    expect(refreshed!.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 7 * DAY_MS - 60_000,
    );
    expect(
      response.headers
        .getSetCookie()
        .some((set) => set.startsWith("better-auth.session_token=")),
    ).toBe(true);
  });
});

describe("signing out", () => {
  it("ends this session only; the account's other devices stay signed in", async () => {
    const { cookie: laptop } = await harness.signUp("one-device@example.com");
    const phone = await harness.signIn("one-device@example.com", "test-password-123");

    const response = await harness.app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie: laptop },
    });
    expect(response.status).toBe(200);

    expect((await games(laptop)).status).toBe(401);
    expect((await games(phone)).status).toBe(200);
  });
});

describe("signing out everywhere", () => {
  it("ends every session of the caller, the current one included, and nobody else's", async () => {
    const { cookie: laptop } = await harness.signUp("everywhere@example.com");
    const phone = await harness.signIn("everywhere@example.com", "test-password-123");
    const { cookie: stranger } = await harness.signUp("stranger@example.com");

    const response = await harness.app.request("/auth/revoke-sessions", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: laptop },
      body: "{}",
    });
    expect(response.status).toBe(200);

    expect((await games(laptop)).status).toBe(401);
    expect((await games(phone)).status).toBe(401);
    expect(
      (await harness.app.request("/accounts", { headers: { cookie: phone } })).status,
    ).toBe(401);
    expect((await games(stranger)).status).toBe(200);
  });

  it("needs a session to be asked", async () => {
    const response = await harness.app.request("/auth/revoke-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(401);
  });
});
