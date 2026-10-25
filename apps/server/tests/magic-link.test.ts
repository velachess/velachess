// @vitest-environment node
import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { schema } from "@velachess/infra-db";
import type { AuthEmail } from "@velachess/infra-email";

import { createApiHarness, ORIGIN, type ApiHarness } from "./harness.ts";

let harness: ApiHarness;
let withoutMagicLink: ApiHarness;
let sent: AuthEmail[] = [];

beforeAll(async () => {
  [harness, withoutMagicLink] = await Promise.all([
    createApiHarness(undefined, {
      sendEmail: async (email) => {
        sent.push(email);
      },
      magicLink: true,
    }),
    createApiHarness(undefined, { sendEmail: () => Promise.resolve() }),
  ]);
});

afterAll(async () => {
  await Promise.all([harness.close(), withoutMagicLink.close()]);
});

beforeEach(() => {
  sent = [];
});

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

let sequence = 0;
const uniqueEmail = () => `reader${++sequence}@example.com`;

async function requestLink(email: string) {
  const response = await harness.app.request(
    "/auth/sign-in/magic-link",
    post({ email, callbackURL: "/", errorCallbackURL: "/login" }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: true });

  const message = await vi.waitFor(() => {
    const found = sent.find((email_) => email_.to === email);
    if (!found) throw new Error(`no magic link for ${email} yet`);
    return found;
  });
  expect(message.template).toBe("magic-link");
  return new URL(message.url);
}

const follow = (link: URL) =>
  harness.app.request(`${link.pathname.replace(/^\/api/, "")}${link.search}`);

const sessionCookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="))
    ?.split(";")[0];

const games = (cookie: string) => harness.app.request("/games", { headers: { cookie } });

async function userByEmail(email: string) {
  const [user] = await harness.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return user;
}

describe("a magic link", () => {
  it("lands on the browser's /api origin and registers an unknown address", async () => {
    const email = uniqueEmail();
    const link = await requestLink(email);
    expect(`${link.origin}${link.pathname}`).toBe(`${ORIGIN}/api/auth/magic-link/verify`);
    expect(await userByEmail(email)).toBeUndefined();

    const followed = await follow(link);
    expect(followed.status).toBe(302);
    expect(followed.headers.get("location")).toBe(`${ORIGIN}/`);
    const cookie = sessionCookieOf(followed);
    expect(cookie).toBeDefined();
    expect((await games(cookie!)).status).toBe(200);

    expect(await userByEmail(email)).toMatchObject({ emailVerified: true });
  });

  it("is stored only as a hash", async () => {
    const link = await requestLink(uniqueEmail());
    const token = link.searchParams.get("token")!;
    const identifiers = (await harness.db.select().from(schema.verifications)).map(
      (row) => row.identifier,
    );

    expect(identifiers.some((identifier) => identifier.includes(token))).toBe(false);
    const hashed = createHash("sha256").update(token).digest("base64url");
    expect(identifiers).toContain(`magic-link:${hashed}`);
  });

  it("works once", async () => {
    const link = await requestLink(uniqueEmail());
    expect((await follow(link)).status).toBe(302);

    const again = await follow(link);
    expect(again.headers.get("location")).toBe(`${ORIGIN}/login?error=INVALID_TOKEN`);
    expect(sessionCookieOf(again)).toBeUndefined();
  });

  it("expires after five minutes", async () => {
    const email = uniqueEmail();
    const link = await requestLink(email);

    const [row] = await harness.db
      .select()
      .from(schema.verifications)
      .where(
        eq(schema.verifications.value, JSON.stringify({ type: "magic-link", email })),
      );
    const ttl = row!.expiresAt.getTime() - row!.createdAt.getTime();
    expect(ttl).toBeGreaterThan(299_000);
    expect(ttl).toBeLessThanOrEqual(300_000);

    await harness.db
      .update(schema.verifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.verifications.id, row!.id));

    const expired = await follow(link);
    expect(expired.headers.get("location")).toBe(`${ORIGIN}/login?error=INVALID_TOKEN`);
    expect(sessionCookieOf(expired)).toBeUndefined();
    expect(await userByEmail(email)).toBeUndefined();
  });

  it("answers an address with an account exactly like an unknown one", async () => {
    const known = uniqueEmail();
    await harness.bootstrapAuth.api.signUpEmail({
      body: { name: "Known", email: known, password: "known-password-1" },
    });

    const responses = await Promise.all(
      [known, uniqueEmail()].map(async (email) => {
        const response = await harness.app.request(
          "/auth/sign-in/magic-link",
          post({ email, callbackURL: "/" }),
        );
        return { status: response.status, body: await response.json() };
      }),
    );
    expect(responses[0]).toEqual(responses[1]);
  });

  it("signs a verified password account in and leaves its password alone", async () => {
    const email = uniqueEmail();
    const password = "verified-password-1";
    await harness.bootstrapAuth.api.signUpEmail({
      body: { name: "Verified", email, password },
    });
    await harness.db
      .update(schema.users)
      .set({ emailVerified: true })
      .where(eq(schema.users.email, email));
    const before = await harness.signIn(email, password);

    const followed = await follow(await requestLink(email));
    expect((await games(sessionCookieOf(followed)!)).status).toBe(200);

    expect((await games(before)).status).toBe(200);
    await expect(harness.signIn(email, password)).resolves.toMatch(/session_token=/);
  });

  it("strips every password and session an unverified account held before the proof", async () => {
    const email = uniqueEmail();
    const password = "squatter-password-1";
    await harness.bootstrapAuth.api.signUpEmail({
      body: { name: "Squatter", email, password },
    });
    const squatter = await harness.bootstrapAuth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    const squatterCookie = sessionCookieOf(squatter)!;
    expect((await games(squatterCookie)).status).toBe(200);

    const followed = await follow(await requestLink(email));
    const ownerCookie = sessionCookieOf(followed)!;

    expect((await games(ownerCookie)).status).toBe(200);
    expect((await games(squatterCookie)).status).toBe(401);
    const user = await userByEmail(email);
    expect(user).toMatchObject({ emailVerified: true });
    expect(
      await harness.db
        .select()
        .from(schema.authAccounts)
        .where(eq(schema.authAccounts.userId, user!.id)),
    ).toEqual([]);
    const refused = await harness.app.request(
      "/auth/sign-in/email",
      post({ email, password }),
    );
    expect(refused.status).toBe(401);
  });
});

describe("without the magic link turned on", () => {
  it("has no endpoint, even with email configured", async () => {
    const response = await withoutMagicLink.app.request(
      "/auth/sign-in/magic-link",
      post({ email: "someone@example.com", callbackURL: "/" }),
    );
    expect(response.status).toBe(404);
  });
});
