// @vitest-environment node
import { describe, expect, it } from "vitest";

import { QUEUES } from "@velachess/infra-queue";

import { buildReadinessChecks, READINESS_TIMEOUT_MS } from "../src/composition/health.ts";
import { createApp } from "../src/server.ts";
import { createApiHarness, type ApiHarness } from "./harness.ts";

async function withHarness(run: (harness: ApiHarness) => Promise<void>) {
  const harness = await createApiHarness();
  try {
    await run(harness);
  } finally {
    if (!harness.pglite.closed) await harness.close();
  }
}

async function takePostgresDown(harness: ApiHarness) {
  await harness.boss.stop({ graceful: false });
  await harness.pglite.close();
}

const ok = { status: "ok", latencyMs: expect.any(Number) };

describe("GET /health/live", () => {
  it("answers without a session and without touching a dependency", async () => {
    await withHarness(async (harness) => {
      await takePostgresDown(harness);

      const response = await harness.app.request("/health/live");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    });
  });
});

describe("GET /health/ready", () => {
  it("is 200 with every check ok and its latency", async () => {
    await withHarness(async (harness) => {
      const response = await harness.app.request("/health/ready");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "ready",
        checks: { database: ok, migrations: ok, queue: ok },
      });
    });
  });

  it("is 503 when the latest migration has not been applied", async () => {
    await withHarness(async (harness) => {
      await harness.pglite.query(
        `delete from drizzle.__drizzle_migrations
          where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`,
      );

      const response = await harness.app.request("/health/ready");

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        status: "not_ready",
        checks: {
          database: ok,
          migrations: { status: "failed", latencyMs: expect.any(Number) },
          queue: ok,
        },
      });
    });
  });

  it("is 503 when the sync queue does not exist", async () => {
    await withHarness(async (harness) => {
      await harness.boss.deleteQueue(QUEUES.sync);

      const response = await harness.app.request("/health/ready");

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        status: "not_ready",
        checks: { database: ok, queue: { status: "failed" } },
      });
    });
  });

  it("is 503 with no error detail when Postgres is unreachable", async () => {
    await withHarness(async (harness) => {
      await takePostgresDown(harness);

      const response = await harness.app.request("/health/ready");

      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).not.toMatch(/closed|error|stack|pglite/i);
      expect(JSON.parse(text)).toMatchObject({
        status: "not_ready",
        checks: { database: { status: "failed", latencyMs: expect.any(Number) } },
      });
    });
  });

  it("times a hanging check out instead of hanging the probe", async () => {
    await withHarness(async (harness) => {
      const app = createApp({
        ...harness.deps,
        readinessChecks: {
          ...buildReadinessChecks(harness.db, harness.boss),
          queue: () => new Promise<boolean>(() => {}),
        },
      });

      const started = performance.now();
      const response = await app.request("/health/ready");
      const elapsed = performance.now() - started;

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        checks: { database: ok, queue: { status: "timeout" } },
      });
      expect(elapsed).toBeLessThan(READINESS_TIMEOUT_MS + 1000);
    });
  });
});
