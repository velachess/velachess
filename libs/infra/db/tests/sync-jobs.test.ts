// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  abandonSyncJob,
  createSyncJob,
  createUser,
  finishSyncJob,
  getSyncJobForUser,
  insertTrackedAccount,
  listTrackedAccountsByUser,
  lockSyncJob,
  markSyncRunning,
  syncJobs,
} from "@velachess/infra-db";

import { createTestDb } from "./test-db.ts";

const { db, close } = await createTestDb();
afterAll(() => close());

async function anAccount() {
  const user = await createUser(db);
  const account = (await insertTrackedAccount(db, user.id, "chess_com", "player"))!;
  return { userId: user.id, accountId: account.id };
}

/** A delivery picking the job up: the attempt every later write is fenced to. */
async function deliver(job: { id: string }) {
  const run = await markSyncRunning(db, job.id);
  if (!run) throw new Error(`job ${job.id} is not active`);
  return { id: job.id, startedAt: run.startedAt };
}

describe("sync jobs", () => {
  it("an account holds one active job; a finished one frees the slot", async () => {
    const owner = await anAccount();
    const first = await createSyncJob(db, { ...owner, trigger: "manual" });
    expect(first).toMatchObject({ status: "queued" });
    expect(await createSyncJob(db, { ...owner, trigger: "manual" })).toBeNull();

    await finishSyncJob(db, await deliver(first!), {
      status: "succeeded",
      errorCode: null,
    });

    expect(await createSyncJob(db, { ...owner, trigger: "manual" })).not.toBeNull();
  });

  it("a delivery runs only an active job", async () => {
    const owner = await anAccount();
    const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    const attempt = await deliver(job);
    expect(attempt.startedAt).toBeInstanceOf(Date);

    await finishSyncJob(db, attempt, {
      status: "succeeded",
      errorCode: null,
      gamesFetched: 3,
      gamesInserted: 2,
    });
    expect(await markSyncRunning(db, job.id)).toBeNull();
  });

  it("a delivery picks up a job from any status that means it is still on its way", async () => {
    // The SQL predicate is the one spelling of `isActiveSyncStatus` that
    // cannot call it. Every status the policy calls active must let a
    // delivery in; every settled one must keep it out.
    for (const status of ["queued", "running", "retrying"] as const) {
      const owner = await anAccount();
      const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
      await db.update(syncJobs).set({ status }).where(eq(syncJobs.id, job.id));
      expect(await markSyncRunning(db, job.id), status).toMatchObject({
        accountId: owner.accountId,
      });
    }
    for (const status of ["succeeded", "failed"] as const) {
      const owner = await anAccount();
      const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
      await finishSyncJob(db, await deliver(job), { status, errorCode: null });
      expect(await markSyncRunning(db, job.id), status).toBeNull();
    }
  });

  it("a retry clears the previous error and adds to the rows inserted so far", async () => {
    const owner = await anAccount();
    const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    await finishSyncJob(db, await deliver(job), {
      status: "retrying",
      errorCode: "incomplete",
      gamesFetched: 40,
      gamesInserted: 40,
    });

    const retry = await deliver(job);
    expect(await getSyncJobForUser(db, owner.userId, job.id)).toMatchObject({
      status: "running",
      errorCode: null,
    });
    await finishSyncJob(db, retry, {
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

  it("an attempt a newer delivery replaced can neither lock nor finish the job", async () => {
    // The stamp is the fence: a delivery pg-boss took the job from (a
    // missed heartbeat, an expiry) may still be running, and whatever it
    // commits after the retry picked the job up must miss the row.
    const owner = await anAccount();
    const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    const stale = await deliver(job);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const current = await deliver(job);
    expect(current.startedAt.getTime()).toBeGreaterThan(stale.startedAt.getTime());

    expect(await db.transaction((tx) => lockSyncJob(tx, stale))).toBe(false);
    await finishSyncJob(db, stale, {
      status: "succeeded",
      errorCode: null,
      gamesInserted: 9,
    });
    expect(await getSyncJobForUser(db, owner.userId, job.id)).toMatchObject({
      status: "running",
      gamesInserted: null,
    });

    expect(await db.transaction((tx) => lockSyncJob(tx, current))).toBe(true);
    await finishSyncJob(db, current, {
      status: "succeeded",
      errorCode: null,
      gamesInserted: 2,
    });
    expect(await getSyncJobForUser(db, owner.userId, job.id)).toMatchObject({
      status: "succeeded",
      gamesInserted: 2,
    });
  });

  it("abandoning closes only a job that is still active, keeping the reason it had", async () => {
    const owner = await anAccount();
    const done = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    await finishSyncJob(db, await deliver(done), {
      status: "succeeded",
      errorCode: null,
    });
    await abandonSyncJob(db, done.id);
    expect(await getSyncJobForUser(db, owner.userId, done.id)).toMatchObject({
      status: "succeeded",
      errorCode: null,
    });

    // Retries spent on an incomplete pass: the row says so, not "internal".
    const spent = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    await finishSyncJob(db, await deliver(spent), {
      status: "retrying",
      errorCode: "incomplete",
    });
    await abandonSyncJob(db, spent.id);
    expect(await getSyncJobForUser(db, owner.userId, spent.id)).toMatchObject({
      status: "failed",
      errorCode: "incomplete",
    });
    expect(await markSyncRunning(db, spent.id)).toBeNull();

    // A delivery that vanished mid-run left no reason.
    const crashed = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
    await deliver(crashed);
    await abandonSyncJob(db, crashed.id);
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
    await finishSyncJob(db, await deliver(old), { status: "succeeded", errorCode: null });
    const newest = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;

    expect(await listTrackedAccountsByUser(db, owner.userId)).toEqual([
      expect.objectContaining({ latestJobId: newest.id, latestJobStatus: "queued" }),
    ]);
  });
});
