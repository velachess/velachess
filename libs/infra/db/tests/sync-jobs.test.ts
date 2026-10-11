// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import {
  abandonSyncJob,
  createSyncJob,
  createUser,
  finishSyncJob,
  getSyncJobForUser,
  insertTrackedAccount,
  listTrackedAccountsByUser,
  markSyncRunning,
} from "@velachess/infra-db";

import { createTestDb } from "./test-db.ts";

const { db, close } = await createTestDb();
afterAll(() => close());

async function anAccount() {
  const user = await createUser(db);
  const account = (await insertTrackedAccount(db, user.id, "chess_com", "player"))!;
  return { userId: user.id, accountId: account.id };
}

describe("sync jobs", () => {
  it("an account holds one active job; a finished one frees the slot", async () => {
    const owner = await anAccount();
    const first = await createSyncJob(db, { ...owner, trigger: "manual" });
    expect(first).toMatchObject({ status: "queued" });
    expect(await createSyncJob(db, { ...owner, trigger: "manual" })).toBeNull();

    await finishSyncJob(db, first!.id, { status: "succeeded", errorCode: null });

    expect(await createSyncJob(db, { ...owner, trigger: "manual" })).not.toBeNull();
  });

  it("a delivery runs only an active job", async () => {
    const owner = await anAccount();
    const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    expect(await markSyncRunning(db, job.id)).toEqual({ accountId: owner.accountId });

    await finishSyncJob(db, job.id, {
      status: "succeeded",
      errorCode: null,
      gamesFetched: 3,
      gamesInserted: 2,
    });
    expect(await markSyncRunning(db, job.id)).toBeNull();
  });

  it("a retry clears the previous error and adds to the rows inserted so far", async () => {
    const owner = await anAccount();
    const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    await markSyncRunning(db, job.id);
    await finishSyncJob(db, job.id, {
      status: "retrying",
      errorCode: "incomplete",
      gamesFetched: 40,
      gamesInserted: 40,
    });

    await markSyncRunning(db, job.id);
    expect(await getSyncJobForUser(db, owner.userId, job.id)).toMatchObject({
      status: "running",
      errorCode: null,
    });
    await finishSyncJob(db, job.id, {
      status: "succeeded",
      errorCode: null,
      gamesFetched: 45,
      gamesInserted: 5,
    });
    expect(await getSyncJobForUser(db, owner.userId, job.id)).toMatchObject({
      gamesFetched: 45,
      gamesInserted: 45,
    });
  });

  it("abandoning closes only a job that is still active", async () => {
    const owner = await anAccount();
    const done = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    await finishSyncJob(db, done.id, { status: "succeeded", errorCode: null });
    await abandonSyncJob(db, done.id);
    expect(await getSyncJobForUser(db, owner.userId, done.id)).toMatchObject({
      status: "succeeded",
      errorCode: null,
    });

    const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    await abandonSyncJob(db, job.id);
    expect(await markSyncRunning(db, job.id)).toBeNull();
    const [listed] = await listTrackedAccountsByUser(db, owner.userId);
    expect(listed).toMatchObject({
      latestJobStatus: "failed",
      latestJobError: "internal",
    });
  });

  it("an account lists alongside its newest job", async () => {
    const owner = await anAccount();
    expect(await listTrackedAccountsByUser(db, owner.userId)).toEqual([
      expect.objectContaining({ latestJobId: null, latestJobStatus: null }),
    ]);

    const old = (await createSyncJob(db, { ...owner, trigger: "connect" }))!;
    await finishSyncJob(db, old.id, { status: "succeeded", errorCode: null });
    const newest = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;

    expect(await listTrackedAccountsByUser(db, owner.userId)).toEqual([
      expect.objectContaining({ latestJobId: newest.id, latestJobStatus: "queued" }),
    ]);
  });
});
