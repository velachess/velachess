// @vitest-environment node
/**
 * `GET /accounts` is the one authoritative read of a sync, and it only
 * reports: a job whose pg-boss delivery ended is closed by the worker's
 * reconciliation pass, never by someone looking at it.
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
  it("reports the newest job's own status, terminal ones included", async () => {
    const { app: owner } = await harness.signUp("outcome@account-sync.test");
    const account = await connectLooper(owner);

    const [queued] = await parseResponse(owner.api.accounts.$get());
    expect(queued).toMatchObject({ syncStatus: "queued", lastSyncError: null });

    await harness.runSync(account.syncId);

    const [succeeded] = await parseResponse(owner.api.accounts.$get());
    expect(succeeded).toMatchObject({ syncStatus: "succeeded", lastSyncError: null });
  });

  it("says nothing of a sync id, so a client cannot follow one", async () => {
    const { app: owner } = await harness.signUp("opaque@account-sync.test");
    await connectLooper(owner);

    const [listed] = await parseResponse(owner.api.accounts.$get());
    expect(listed).not.toHaveProperty("activeSyncId");
  });

  it("keeps reporting a sync whose delivery is still waiting", async () => {
    const { app: owner } = await harness.signUp("waiting@account-sync.test");
    await connectLooper(owner);

    const [listed] = await parseResponse(owner.api.accounts.$get());
    expect(listed?.syncStatus).toBe("queued");
  });

  it("does not close a job with no delivery behind it: reading never writes", async () => {
    const { app: owner, userId } = await harness.signUp("stale@account-sync.test");
    const account = await connectLooper(owner);
    await harness.runSync(account.syncId);

    // A row with nothing queued behind it: what a sync out of retries
    // leaves in the dead-letter queue, and what an enqueue that never
    // landed leaves too.
    const orphan = await createSyncJob(harness.db, {
      userId,
      accountId: account.id,
      trigger: "manual",
    });
    expect(orphan?.status).toBe("queued");

    const [first] = await parseResponse(owner.api.accounts.$get());
    const [second] = await parseResponse(owner.api.accounts.$get());
    expect(first?.syncStatus).toBe("queued");
    expect(second).toEqual(first);
  });

  it("reports a stranger nothing, whatever their own accounts say", async () => {
    const { app: alice } = await harness.signUp("alice@account-sync.test");
    const { app: bob } = await harness.signUp("bob@account-sync.test");
    const aliceAccount = await connectLooper(alice);

    expect(await parseResponse(bob.api.accounts.$get())).toEqual([]);
    const [listed] = await parseResponse(alice.api.accounts.$get());
    expect(listed?.id).toBe(aliceAccount.id);
  });
});
