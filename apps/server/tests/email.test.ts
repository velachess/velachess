// @vitest-environment node
/**
 * Verification and password reset over HTTP, with the real Better Auth on
 * PGlite and a capturing sender in place of Resend. Links are followed the
 * way a browser would: through the `/api` prefix the web proxy strips.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { schema } from "@velachess/infra-db";
import type { AuthEmail } from "@velachess/infra-email";

import { createApiHarness, ORIGIN, type ApiHarness } from "./harness.ts";

let withEmail: ApiHarness;
let withoutEmail: ApiHarness;

let sent: AuthEmail[] = [];
let deliver: (email: AuthEmail) => Promise<void>;

beforeAll(async () => {
  [withEmail, withoutEmail] = await Promise.all([
    createApiHarness(undefined, { sendEmail: (email) => deliver(email) }),
    createApiHarness(),
  ]);
});

afterAll(async () => {
  await Promise.all([withEmail.close(), withoutEmail.close()]);
});

beforeEach(() => {
  sent = [];
  deliver = async (email) => {
    sent.push(email);
  };
});

const post = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

let sequence = 0;
const uniqueEmail = () => `player${++sequence}@example.com`;

async function unverifiedUser(harness: ApiHarness, password = "old-password-123") {
  const email = uniqueEmail();
  await harness.bootstrapAuth.api.signUpEmail({
    body: { name: "Player", email, password },
  });
  return { email, password };
}

async function verifiedUser(harness: ApiHarness) {
  const user = await unverifiedUser(harness);
  await harness.db
    .update(schema.users)
    .set({ emailVerified: true })
    .where(eq(schema.users.email, user.email));
  return user;
}

const signInRequest = (harness: ApiHarness, email: string, password: string) =>
  harness.app.request("/auth/sign-in/email", post({ email, password }));

async function emailFor(to: string, template: AuthEmail["template"]): Promise<AuthEmail> {
  return vi.waitFor(() => {
    const email = sent.find(
      (candidate) => candidate.to === to && candidate.template === template,
    );
    if (!email) throw new Error(`no ${template} email for ${to} yet`);
    return email;
  });
}

/** The browser reaches Better Auth under `/api`; the harness serves it bare. */
const throughProxy = (link: URL) =>
  `${link.pathname.replace(/^\/api/, "")}${link.search}`;

describe("password reset", () => {
  it("emails a link whose token sets a new password and ends every session", async () => {
    const { email, password } = await verifiedUser(withEmail);
    const cookie = await withEmail.signIn(email, password);

    const requested = await withEmail.app.request(
      "/auth/request-password-reset",
      post({ email }, { "accept-language": "pt-BR,pt;q=0.9" }),
    );
    expect(requested.status).toBe(200);

    const resetEmail = await emailFor(email, "reset-password");
    expect(resetEmail.acceptLanguage).toBe("pt-BR,pt;q=0.9");
    const link = new URL(resetEmail.url);
    expect(`${link.origin}${link.pathname}`).toBe(`${ORIGIN}/reset-password`);
    const token = link.searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await withEmail.app.request(
      "/auth/reset-password",
      post({ newPassword: "new-password-456", token }),
    );
    expect(reset.status).toBe(200);

    expect((await withEmail.app.request("/games", { headers: { cookie } })).status).toBe(
      401,
    );
    expect((await signInRequest(withEmail, email, password)).status).toBe(401);
    expect((await signInRequest(withEmail, email, "new-password-456")).status).toBe(200);

    const reused = await withEmail.app.request(
      "/auth/reset-password",
      post({ newPassword: "third-password-789", token }),
    );
    expect(reused.ok).toBe(false);
  });

  it("keys the send on the token without exposing it", async () => {
    const { email } = await verifiedUser(withEmail);

    await withEmail.app.request("/auth/request-password-reset", post({ email }));

    const resetEmail = await emailFor(email, "reset-password");
    const token = new URL(resetEmail.url).searchParams.get("token") ?? "";
    expect(resetEmail.idempotencyKey).toMatch(/^reset-password\/[0-9a-f]{64}$/);
    expect(resetEmail.idempotencyKey).not.toContain(token);
  });

  it("answers an unknown address exactly like a known one, and sends nothing", async () => {
    const response = await withEmail.app.request(
      "/auth/request-password-reset",
      post({ email: "nobody@example.com" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: true });
    expect(sent).toEqual([]);
  });

  it("answers before the email is sent, and survives a failed send", async () => {
    const { email } = await verifiedUser(withEmail);
    deliver = () => new Promise(() => {});
    const pending = await withEmail.app.request(
      "/auth/request-password-reset",
      post({ email }),
    );
    expect(pending.status).toBe(200);

    deliver = () => Promise.reject(new Error("resend is down"));
    const failed = await withEmail.app.request(
      "/auth/request-password-reset",
      post({ email }),
    );
    expect(failed.status).toBe(200);
  });
});

describe("email verification", () => {
  it("an unverified account is refused, emailed a link, and signs in once it is followed", async () => {
    const { email, password } = await unverifiedUser(withEmail);

    const refused = await signInRequest(withEmail, email, password);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

    const verifyEmail = await emailFor(email, "verify-email");
    const link = new URL(verifyEmail.url);
    expect(`${link.origin}${link.pathname}`).toBe(`${ORIGIN}/api/auth/verify-email`);

    const followed = await withEmail.app.request(throughProxy(link));
    expect(followed.status).toBe(302);
    expect(followed.headers.get("location")).toBe("/login");

    expect((await signInRequest(withEmail, email, password)).status).toBe(200);
  });
});

describe("without email configured", () => {
  it("reports password reset as unavailable and refuses to start one", async () => {
    const config = await withoutEmail.app.request("/config");
    expect(await config.json()).toMatchObject({
      signInMethods: { passwordReset: false },
    });

    const { email } = await verifiedUser(withoutEmail);
    const requested = await withoutEmail.app.request(
      "/auth/request-password-reset",
      post({ email }),
    );
    expect(requested.ok).toBe(false);
  });

  it("leaves sign-in as it was, verified or not", async () => {
    const { email, password } = await unverifiedUser(withoutEmail);
    expect((await signInRequest(withoutEmail, email, password)).status).toBe(200);
  });
});

describe("with email configured", () => {
  it("reports password reset as available", async () => {
    const config = await withEmail.app.request("/config");
    expect(await config.json()).toMatchObject({ signInMethods: { passwordReset: true } });
  });
});
