// @vitest-environment node
/**
 * The edge every request crosses before a route sees it: secure headers, a
 * body ceiling, an origin check, and the per-user budgets.
 *
 * Over the real harness app, in the order production assembles it, because
 * the order is most of the security property.
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

/** The limiter runs before the handler, so a 404 past it is all these
 * tests need. Callers that care about the budget reuse one id. */
const sync = (accountId: string = randomUUID()) => `/accounts/${accountId}/sync`;

// The store has no embedded fallback, so these assertions need `REDIS_URL`.
// Without it the store fails open and only this block skips (harness.ts).
describe.skipIf(!process.env["REDIS_URL"])("rate limiting", () => {
  it("refuses past the policy's budget, and says when to come back", async () => {
    const limited = await harness.signUp("throttled@velachess.local");
    const accountId = randomUUID();

    for (let i = 0; i < POLICIES.import.max; i++) {
      const response = await limited.app.api.accounts[":id"].sync.$post({
        param: { id: accountId },
      });
      expect(response.status, `request ${i + 1}`).not.toBe(429);
    }

    const refused = await limited.app.api.accounts[":id"].sync.$post({
      param: { id: accountId },
    });
    expect(refused.status).toBe(429);
    if (refused.status !== 429) throw new Error("unreachable");

    // In the body as well as the header, because the SPA's client can only
    // read the body of a rejection. Never 0, which a client retries
    // immediately.
    const body = await refused.json();
    expect(body.error).toBe("too many requests");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(POLICIES.import.windowSeconds);

    // The header says the same number: two that disagree teach clients to
    // trust neither.
    expect(Number(refused.headers.get("retry-after"))).toBe(body.retryAfterSeconds);
  });

  it("is one budget per user, not one for the API", async () => {
    // The previous user is over the import limit, and the key is the userId
    // the session proved, so nobody can throttle anybody else.
    const other = await harness.signUp("unthrottled@velachess.local");
    const response = await other.app.request(sync(), { method: "POST" });
    expect(response.status).not.toBe(429);
  });

  it("holds across processes, because it lives in Redis", async () => {
    // A second app over the same Redis stands in for a second API instance.
    // An in-memory counter would hand this user a fresh budget.
    const second = createApp(harness.deps);
    const spender = await harness.signUp("shared@velachess.local");
    const accountId = randomUUID();

    for (let i = 0; i < POLICIES.import.max; i++) {
      await spender.app.request(sync(accountId), { method: "POST" });
    }

    const response = await second.request(sync(accountId), {
      method: "POST",
      headers: { cookie: spender.cookie, origin: ORIGIN },
    });
    expect(response.status).toBe(429);
  });

  it("budgets separately per account, so tracking several does not throttle the first", async () => {
    // Keyed by (userId, accountId), so a user syncing six accounts gets six
    // budgets.
    const owner = await harness.signUp("multi-account@velachess.local");
    const first = randomUUID();

    for (let i = 0; i < POLICIES.import.max; i++) {
      await owner.app.request(sync(first), { method: "POST" });
    }
    const firstExhausted = await owner.app.request(sync(first), { method: "POST" });
    expect(firstExhausted.status).toBe(429);

    const second = await owner.app.request(sync(randomUUID()), { method: "POST" });
    expect(second.status).not.toBe(429);
  });

  it("leaves the health probes alone", async () => {
    // Above the gate and outside every policy: a throttled probe lies
    // during an incident.
    for (let i = 0; i < POLICIES.import.max + 5; i++) {
      for (const path of ["/health/live", "/health/ready"]) {
        const response = await harness.app.request(path);
        expect(response.status, path).toBe(200);
      }
    }
  });
});

describe("the request edge", () => {
  it("refuses a body past the ceiling before parsing it", async () => {
    const oversized = "x".repeat(300 * 1024);
    const response = await user.app.request("/games/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pgn: oversized, playerName: "looper" }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload too large" });
  });

  it("accepts a normal body on the same route", async () => {
    const response = await user.app.request("/games/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pgn: "1. e4 e5 *", playerName: "looper" }),
    });
    expect(response.ok).toBe(true);
  });

  it("rejects a cross-site form post carrying the session cookie", async () => {
    // A form on another origin posting with the browser's cookies, refused
    // before the session is looked up.
    const response = await harness.app.request("/games/import", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        cookie: user.cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "pgn=Stolen&playerName=looper",
    });
    expect(response.status).toBe(403);
    // Never `{ error: "" }`: hono's csrf throws without a message.
    expect(await response.json()).toEqual({ error: "request rejected" });
  });

  it("rejects a cross-site request that declares no content type", async () => {
    // A missing Content-Type is form-postable too.
    const response = await harness.app.request("/games/import", {
      method: "POST",
      headers: { origin: "https://evil.example", cookie: user.cookie },
    });
    expect(response.status).toBe(403);
  });

  it("lets the app's own origin through", async () => {
    const response = await harness.app.request("/games", {
      headers: { origin: ORIGIN, cookie: user.cookie },
    });
    expect(response.status).toBe(200);
  });

  it("sends the baseline security headers on every answer", async () => {
    for (const path of ["/health/live", "/games"]) {
      const response = await harness.app.request(path, {
        headers: { cookie: user.cookie },
      });
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("referrer-policy"), path).toBeTruthy();
      expect(response.headers.get("x-frame-options"), path).toBeTruthy();
    }
  });
});

describe("CORS", () => {
  it("answers a preflight from a trusted origin, with credentials", async () => {
    const response = await harness.app.request("/games", {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": "content-type",
      },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    // Without it the browser drops the session cookie cross-origin, and the
    // deployment fails as "logged out".
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Content-Type",
    );
  });

  it("declines to name an untrusted origin", async () => {
    const response = await harness.app.request("/games", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "GET" },
    });
    // Hono answers the preflight either way; it must not echo an origin it
    // was not told to trust.
    expect(response.headers.get("access-control-allow-origin")).not.toBe(
      "https://evil.example",
    );
  });

  it("never widens to a wildcard", async () => {
    const response = await harness.app.request("/health/live", {
      headers: { origin: ORIGIN },
    });
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
  });
});

describe("what sits above the session gate", () => {
  it("is exactly health, the spec, and Better Auth", async () => {
    // Anything else answering without a cookie is a route mounted above the
    // gate by accident.
    for (const path of ["/health/live", "/health/ready", "/config", "/openapi.json"]) {
      const response = await harness.app.request(path);
      expect(response.status, path).toBe(200);
    }

    // Public, so it carries capability flags and nothing identifying.
    const config = await (await harness.app.request("/config")).json();
    expect(config).toEqual({
      signInMethods: { password: true, google: false, passwordReset: false },
    });

    // Auth answers without a session, but that is Better Auth, not one of
    // our routes.
    const session = await harness.app.request("/auth/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toBeNull();

    for (const path of ["/games", "/accounts"]) {
      const response = await harness.app.request(path);
      expect(response.status, path).toBe(401);
    }
  });
});
