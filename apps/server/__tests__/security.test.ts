// @vitest-environment node
/**
 * The edge every request crosses before a route sees it: secure headers,
 * a body ceiling, an origin check, and the per-user budgets.
 *
 * All of it over the real harness app — the same middleware chain
 * production assembles, in the same order, because the order is most of
 * the security property.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { createApp } from "../src/server.ts";
import { POLICIES } from "../src/middleware/rate-limit.ts";
import { createApiHarness, ORIGIN, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;
let user: { userId: string; cookie: string; app: AuthedApp };

beforeAll(async () => {
  harness = await createApiHarness();
  user = await harness.signUp("edge@velachess.local");
});

afterAll(async () => {
  await harness.close();
});

/** A route that is cheap to call and cannot succeed — the limiter runs
 * before the handler, so a 404 past it is all these tests need. */
const sync = () => `/accounts/${randomUUID()}/sync`;

describe("rate limiting", () => {
  it("refuses past the policy's budget, and says when to come back", async () => {
    const limited = await harness.signUp("throttled@velachess.local");

    for (let i = 0; i < POLICIES.import.max; i++) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      const response = await limited.app.request(sync(), { method: "POST" });
      expect(response.status, `request ${i + 1}`).not.toBe(429);
    }

    const refused = await limited.app.request(sync(), { method: "POST" });
    expect(refused.status).toBe(429);

    // The wait lives in the body as well as the header, because the SPA's
    // client can only read the body of a rejection — same contract as the
    // sync cooldown. Never 0: a client told to wait zero seconds retries
    // immediately, which is the behaviour the refusal exists to prevent.
    const body = (await refused.json()) as {
      error: string;
      retryAfterSeconds: number;
    };
    expect(body.error).toBe("too many requests");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(POLICIES.import.windowSeconds);

    // And the header says the same number — two answers that disagree
    // would teach clients to trust neither.
    expect(Number(refused.headers.get("retry-after"))).toBe(body.retryAfterSeconds);
  });

  it("is one budget per user, not one for the API", async () => {
    // The previous user is over the import limit. A different session is
    // unaffected: the key is the userId the session proved, so nobody can
    // throttle anybody else.
    const other = await harness.signUp("unthrottled@velachess.local");
    const response = await other.app.request(sync(), { method: "POST" });
    expect(response.status).not.toBe(429);
  });

  it("holds across processes, because it lives in Postgres", async () => {
    // A second app over the same database stands in for a second API
    // instance behind the load balancer. An in-memory counter would give
    // this user a fresh budget here; a shared one does not.
    const second = createApp(harness.deps);
    const spender = await harness.signUp("shared@velachess.local");

    for (let i = 0; i < POLICIES.import.max; i++) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await spender.app.request(sync(), { method: "POST" });
    }

    const response = await second.request(sync(), {
      method: "POST",
      headers: { cookie: spender.cookie, origin: ORIGIN },
    });
    expect(response.status).toBe(429);
  });

  it("leaves the liveness probe alone", async () => {
    // /health sits above the gate and outside every policy on purpose: a
    // probe that can be throttled is a probe that lies during an incident.
    for (let i = 0; i < POLICIES.import.max + 5; i++) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      const response = await harness.app.request("/health");
      expect(response.status).toBe(200);
    }
  });
});

describe("the request edge", () => {
  it("refuses a body past the ceiling before parsing it", async () => {
    const oversized = "x".repeat(300 * 1024);
    const response = await user.app.request("/repertoires", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: oversized, color: "white" }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload too large" });
  });

  it("accepts a normal body on the same route", async () => {
    const response = await user.app.request("/repertoires", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "White e4", color: "white" }),
    });
    expect(response.ok).toBe(true);
  });

  it("rejects a cross-site form post carrying the session cookie", async () => {
    // The shape of a real CSRF attempt: a form on another origin, posting
    // with the browser's cookies attached. It is refused before the
    // session is even looked up.
    const response = await harness.app.request("/repertoires", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        cookie: user.cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "name=Stolen&color=white",
    });
    expect(response.status).toBe(403);
    // Never `{ error: "" }` — hono's csrf throws without a message.
    expect(await response.json()).toEqual({ error: "request rejected" });
  });

  it("rejects a cross-site request that declares no content type", async () => {
    // A missing Content-Type is form-postable too, so it is checked the
    // same way rather than waved through.
    const response = await harness.app.request("/repertoires", {
      method: "POST",
      headers: { origin: "https://evil.example", cookie: user.cookie },
    });
    expect(response.status).toBe(403);
  });

  it("lets the app's own origin through", async () => {
    const response = await harness.app.request("/overview", {
      headers: { origin: ORIGIN, cookie: user.cookie },
    });
    expect(response.status).toBe(200);
  });

  it("sends the baseline security headers on every answer", async () => {
    for (const path of ["/health", "/overview"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      const response = await harness.app.request(path, {
        headers: { cookie: user.cookie },
      });
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("referrer-policy"), path).toBeTruthy();
      // No API answer should ever be framed.
      expect(response.headers.get("x-frame-options"), path).toBeTruthy();
    }
  });
});

describe("CORS", () => {
  it("answers a preflight from a trusted origin, with credentials", async () => {
    const response = await harness.app.request("/overview", {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": "content-type",
      },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    // Without this the browser drops the session cookie on a cross-origin
    // request, and the deployment fails in a way that looks like "logged out".
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Content-Type",
    );
  });

  it("declines to name an untrusted origin", async () => {
    const response = await harness.app.request("/overview", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "GET" },
    });
    // Hono answers the preflight either way; what matters is that it never
    // echoes an origin it was not told to trust, so the browser refuses.
    expect(response.headers.get("access-control-allow-origin")).not.toBe(
      "https://evil.example",
    );
  });

  it("never widens to a wildcard", async () => {
    const response = await harness.app.request("/health", {
      headers: { origin: ORIGIN },
    });
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
  });
});

describe("what sits above the session gate", () => {
  it("is exactly health, the spec, and Better Auth", async () => {
    // Anything else answering without a cookie would be a route mounted
    // above the gate by accident — the failure this test exists to catch.
    for (const path of ["/health", "/config", "/openapi.json"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      const response = await harness.app.request(path);
      expect(response.status, path).toBe(200);
    }

    // /config is public on purpose, so what it carries matters: capability
    // flags, and nothing that could identify a person or a credential.
    const config = await (await harness.app.request("/config")).json();
    expect(config).toEqual({ signInMethods: { password: true, google: false } });

    // Auth answers without a session (that is what signing in is), but it
    // is Better Auth answering, not one of our routes.
    const session = await harness.app.request("/auth/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toBeNull();

    for (const path of [
      "/overview",
      "/games",
      "/repertoires",
      "/deviations",
      "/drill/queue",
      "/insights",
      "/accounts",
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      const response = await harness.app.request(path);
      expect(response.status, path).toBe(401);
    }
  });
});
