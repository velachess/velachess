// @vitest-environment node
/**
 * `GET /accounts` is where the games screen reads "still syncing" from, so
 * it has to answer it the way `GET /syncs/{id}` does. Read raw, a row left
 * active by a delivery pg-boss ended says "syncing" for good: the Sync
 * button never re-enables, and `sync_jobs_one_active_per_account` keeps
 * every later sync out.
 */
import { parseResponse } from "hono/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSyncJob } from "@velachess/infra-db";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(() => harness.close());

async function connectLooper(app: AuthedApp) {
  const created = await app.api.accounts.$post({
    json: { platform: "chess_com", username: "looper" },
  });
  expect(created.status).toBe(201);
  if (created.status !== 201) throw new Error("unreachable");
  const account = await created.json();
  if (!account.syncId) throw new Error("expected a first sync on a fresh connect");
  return { ...account, syncId: account.syncId };
}

describe("GET /accounts sync state", () => {
  it("leaves a sync alone while its delivery is still waiting", async () => {
    const { app: owner } = await harness.signUp("waiting@account-sync.test");
    await connectLooper(owner);

    const [listed] = await parseResponse(owner.api.accounts.$get());

    expect(listed?.syncStatus).toBe("queued");
    expect(listed?.activeSyncId).not.toBeNull();
  });

  it("closes one with no delivery behind it rather than reporting it forever", async () => {
    const { app: owner, userId } = await harness.signUp("stale@account-sync.test");
    const account = await connectLooper(owner);
    await harness.runSync(account.syncId);

    // A row with nothing queued behind it: what a sync that exhausted its
    // retries leaves in the dead-letter queue, and what an enqueue that
    // never landed leaves too.
    const orphan = await createSyncJob(harness.db, {
      userId,
      accountId: account.id,
      trigger: "manual",
    });
    expect(orphan?.status).toBe("queued");

    const [listed] = await parseResponse(owner.api.accounts.$get());

    expect(listed).toMatchObject({
      syncStatus: "idle",
      activeSyncId: null,
      lastSyncError: "internal",
    });
  });
});
