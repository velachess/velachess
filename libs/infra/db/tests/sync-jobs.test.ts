// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  abandonSyncJob,
  createSyncJob,
  createUser,
  finishSyncJob,
  getSyncJobForUser,
  getSyncJobSettlement,
  insertTrackedAccount,
  listTrackedAccountsByUser,
  claimSyncAttempt,
  markSyncRunning,
  SYNC_JOB_CHANGED_CHANNEL,
  syncJobs,
} from "@velachess/infra-db";

import { createTestDb } from "./test-db.ts";

const { db, listen, close } = await createTestDb();
afterAll(() => close());

/** Notifications arrive on their own tick; this lets them. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

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

    expect(await db.transaction((tx) => claimSyncAttempt(tx, stale))).toBe(false);
    await finishSyncJob(db, stale, {
      status: "succeeded",
      errorCode: null,
      gamesInserted: 9,
    });
    expect(await getSyncJobForUser(db, owner.userId, job.id)).toMatchObject({
      status: "running",
      gamesInserted: null,
    });

    expect(await db.transaction((tx) => claimSyncAttempt(tx, current))).toBe(true);
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

  describe("announcing a settled job", () => {
    it("is heard on commit, by id, and not for a pass that will retry", async () => {
      const owner = await anAccount();
      const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
      const heard: string[] = [];
      const unlisten = await listen(SYNC_JOB_CHANGED_CHANNEL, (id) => heard.push(id));

      await finishSyncJob(db, await deliver(job), {
        status: "retrying",
        errorCode: "incomplete",
      });
      await settle();
      expect(heard).toEqual([]);

      const retry = await deliver(job);
      await db.transaction(async (tx) => {
        await finishSyncJob(tx, retry, { status: "succeeded", errorCode: null });
        // Not yet: the games committing alongside are not visible either.
        await settle();
        expect(heard).toEqual([]);
      });
      await settle();
      expect(heard).toEqual([job.id]);
      await unlisten();
    });

    it("says nothing for an attempt that no longer owns the row", async () => {
      const owner = await anAccount();
      const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
      const stale = await deliver(job);
      await finishSyncJob(db, stale, { status: "retrying", errorCode: "internal" });
      await deliver(job); // re-stamped: the old attempt is obsolete

      const heard: string[] = [];
      const unlisten = await listen(SYNC_JOB_CHANGED_CHANNEL, (id) => heard.push(id));
      await finishSyncJob(db, stale, { status: "succeeded", errorCode: null });
      await settle();
      expect(heard).toEqual([]);
      await unlisten();
    });

    it("is heard when a job is abandoned, once", async () => {
      const owner = await anAccount();
      const job = (await createSyncJob(db, { ...owner, trigger: "manual" }))!;
      const heard: string[] = [];
      const unlisten = await listen(SYNC_JOB_CHANGED_CHANNEL, (id) => heard.push(id));

      await abandonSyncJob(db, job.id);
      await abandonSyncJob(db, job.id); // already closed: no second announcement
      await settle();
      expect(heard).toEqual([job.id]);
      expect(await getSyncJobSettlement(db, job.id)).toMatchObject({
        userId: owner.userId,
        accountId: owner.accountId,
        status: "failed",
      });
      await unlisten();
    });

    it("resolves to nothing once the row is gone", async () => {
      expect(
        await getSyncJobSettlement(db, "00000000-0000-4000-8000-000000000000"),
      ).toBeNull();
    });
  });
});
