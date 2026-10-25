// @vitest-environment node
/**
 * Google's token endpoint is the one network call stubbed: everything from
 * the authorization request to the session cookie is Better Auth's own flow.
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { schema } from "@velachess/infra-db";
import type { AuthEmail } from "@velachess/infra-email";

import { createApiHarness, type ApiHarness } from "./harness.ts";

let harness: ApiHarness;
const sent: AuthEmail[] = [];

beforeAll(async () => {
  harness = await createApiHarness(undefined, {
    google: { clientId: "client-id", clientSecret: "client-secret" },
    sendEmail: async (email) => {
      sent.push(email);
    },
    magicLink: true,
  });
});

afterAll(async () => {
  await harness.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const base64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

function idToken(email: string, sub: string) {
  const now = Math.floor(Date.now() / 1000);
  return [
    base64url({ alg: "RS256", typ: "JWT" }),
    base64url({
      iss: "https://accounts.google.com",
      aud: "client-id",
      sub,
      email,
      email_verified: true,
      name: "Google Person",
      iat: now,
      exp: now + 3600,
    }),
    "signature",
  ].join(".");
}

const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

const sessionCookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="))
    ?.split(";")[0];

async function signInWithGoogle(email: string, sub: string) {
  const started = await harness.app.request(
    "/auth/sign-in/social",
    post({ provider: "google", callbackURL: "/", errorCallbackURL: "/login" }),
  );
  const { url }: { url: string } = await started.json();
  const state = new URL(url).searchParams.get("state")!;

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const target = input instanceof Request ? input.url : String(input);
    if (target.startsWith("https://oauth2.googleapis.com/token")) {
      return Promise.resolve(
        Response.json({
          access_token: "google-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          id_token: idToken(email, sub),
        }),
      );
    }
    return realFetch(input, init);
  });

  return harness.app.request(`/auth/callback/google?code=google-code&state=${state}`, {
    headers: { cookie: cookiesOf(started) },
  });
}

async function accountsOf(email: string) {
  const [user] = await harness.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email));
  const accounts = await harness.db
    .select()
    .from(schema.authAccounts)
    .where(eq(schema.authAccounts.userId, user!.id));
  return {
    user: user!,
    providers: accounts.map((account) => account.providerId).toSorted(),
  };
}

describe("Google sign-in", () => {
  it("registers an address nobody holds", async () => {
    const response = await signInWithGoogle("newcomer@example.com", "google-newcomer");

    expect(response.headers.get("location")).toBe("/");
    expect(sessionCookieOf(response)).toBeDefined();
    const { user, providers } = await accountsOf("newcomer@example.com");
    expect(user.emailVerified).toBe(true);
    expect(providers).toEqual(["google"]);
  });

  it("joins the account a magic link proved", async () => {
    const email = "proved@example.com";
    await harness.app.request(
      "/auth/sign-in/magic-link",
      post({ email, callbackURL: "/" }),
    );
    const link = await vi.waitFor(() => {
      const found = sent.find((message) => message.to === email);
      if (!found) throw new Error("no magic link yet");
      return new URL(found.url);
    });
    await harness.app.request(`${link.pathname.replace(/^\/api/, "")}${link.search}`);
    const before = await accountsOf(email);

    const response = await signInWithGoogle(email, "google-proved");

    expect(sessionCookieOf(response)).toBeDefined();
    const after = await accountsOf(email);
    expect(after.user.id).toBe(before.user.id);
    expect(after.providers).toEqual(["google"]);
  });

  it("never joins an account whose address was not proven", async () => {
    // Joining would hand whoever registered the address first a share of
    // the Google owner's account.
    const email = "unproven@example.com";
    await harness.bootstrapAuth.api.signUpEmail({
      body: { name: "Squatter", email, password: "squatter-password-1" },
    });

    const response = await signInWithGoogle(email, "google-unproven");

    expect(response.headers.get("location")).toBe("/login?error=account_not_linked");
    expect(sessionCookieOf(response)).toBeUndefined();
    const { user, providers } = await accountsOf(email);
    expect(user.emailVerified).toBe(false);
    expect(providers).toEqual(["credential"]);
  });
});
