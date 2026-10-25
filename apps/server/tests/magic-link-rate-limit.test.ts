// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiHarness, type ApiHarness } from "./harness.ts";

// Better Auth reads NODE_ENV once, at import, to decide whether to rate limit.
vi.hoisted(() => {
  process.env["NODE_ENV"] = "production";
});

let harness: ApiHarness;

beforeAll(async () => {
  harness = await createApiHarness(undefined, {
    sendEmail: () => Promise.resolve(),
    magicLink: true,
  });
});

afterAll(async () => {
  await harness.close();
});

const fromOneClient = (path: string, init: RequestInit = {}) =>
  harness.app.request(path, {
    ...init,
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
  });

describe("magic link rate limit", () => {
  it("sends five links a minute per client, then answers 429", async () => {
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fromOneClient("/auth/sign-in/magic-link", {
        method: "POST",
        body: JSON.stringify({ email: `flood${attempt}@example.com`, callbackURL: "/" }),
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("checks five tokens a minute per client, then answers 429", async () => {
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fromOneClient(
        `/auth/magic-link/verify?token=guess-${attempt}&callbackURL=/`,
      );
      statuses.push(response.status);
    }
    expect(statuses).toEqual([302, 302, 302, 302, 302, 429]);
  });
});
