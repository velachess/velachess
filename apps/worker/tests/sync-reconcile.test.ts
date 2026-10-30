// @vitest-environment node
/** The pass closes a job whose delivery pg-boss ended, with no browser and
 * no read involved. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSyncJob,
  createUser,
  getSyncJobForUser,
  insertTrackedAccount,
  markSyncRunning,
  SYNC_JOB_CHANGED_CHANNEL,
} from "@velachess/infra-db";
import { reconcileSyncs } from "@velachess/accounts";
import { LOOPER_USERNAME } from "@velachess/fixtures";
import {
  chessComFixtureFetch,
  createLoopHarness,
  deliverSyncJob,
  type LoopHarness,
} from "@velachess/test-utils";
import { logger } from "@velachess/infra-logger";
import { QUEUES } from "@velachess/infra-queue";

import { buildReconcileSyncsDeps } from "../src/composition/accounts.ts";
import { Worker } from "../src/worker.ts";

let h: LoopHarness;
const testLogger = logger.child({ component: "test-worker" }, { level: "silent" });

beforeAll(async () => {
  h = await createLoopHarness();
});

afterAll(() => h.close());

/** Recorded and queued as the API does. */
async function newSyncJob() {
  const user = await createUser(h.db);
  const account = (await insertTrackedAccount(
    h.db,
    user.id,
    "chess_com",
    LOOPER_USERNAME,
  ))!;
  return h.db.transaction(async (tx) => {
    const job = (await createSyncJob(tx, {
      userId: user.id,
      accountId: account.id,
      trigger: "manual",
    }))!;
    await h.syncQueue.enqueue(tx, { ...job, platform: account.platform });
    return job;
  });
}

const reconcile = () => reconcileSyncs(buildReconcileSyncsDeps(h.db, h.syncQueue));

const jobOf = (job: { id: string; userId: string }) =>
  getSyncJobForUser(h.db, job.userId, job.id);

const bossStateOf = async (job: { id: string }) =>
  (
    await h.pglite.query<{ state: string }>(
      "select state from pgboss.job where name = $1 and id = $2",
      [QUEUES.sync, job.id],
    )
  ).rows[0];

/** Notifications arrive on their own tick. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/** What a pass that kept throwing leaves behind, and what an expired
 * attempt leaves once its retries are gone too. */
async function spendDelivery(job: { id: string }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const delivery = await deliverSyncJob(h.boss, job.id);
    await h.boss.fail(QUEUES.sync, delivery);
  }
}

describe("reconciling syncs", () => {
  it("closes a job whose delivery pg-boss failed for good, and says so once", async () => {
    const job = await newSyncJob();
    await spendDelivery(job);
    expect(await bossStateOf(job)).toMatchObject({ state: "failed" });

    const heard: string[] = [];
    const unlisten = await h.pglite.listen(SYNC_JOB_CHANGED_CHANNEL, (id) =>
      heard.push(id),
    );

    expect(await reconcile()).toBe(1);
    expect(await jobOf(job)).toMatchObject({
      status: "failed",
      errorCode: "internal",
    });

    await settle();
    expect(heard).toEqual([job.id]);
    await unlisten();
  });

  it("closes a job whose delivery was cancelled", async () => {
    const job = await newSyncJob();
    await h.boss.cancel(QUEUES.sync, job.id);

    expect(await reconcile()).toBe(1);
    expect(await jobOf(job)).toMatchObject({ status: "failed" });
  });

  it("closes a job whose delivery is gone from the queue entirely", async () => {
    const job = await newSyncJob();
    await h.boss.deleteJob(QUEUES.sync, job.id);

    expect(await reconcile()).toBe(1);
    expect(await jobOf(job)).toMatchObject({ status: "failed" });
  });

  it("leaves a job whose delivery is still on its way", async () => {
    const waiting = await newSyncJob();
    expect(await reconcile()).toBe(0);
    expect(await jobOf(waiting)).toMatchObject({ status: "queued" });

    const running = await newSyncJob();
    await deliverSyncJob(h.boss, running.id);
    await markSyncRunning(h.db, running.id);
    expect(await reconcile()).toBe(0);
    expect(await jobOf(running)).toMatchObject({ status: "running" });
  });

  it("changes nothing on a second pass, and announces nothing", async () => {
    const job = await newSyncJob();
    await h.boss.cancel(QUEUES.sync, job.id);
    await reconcile();
    const closed = await jobOf(job);

    const heard: string[] = [];
    const unlisten = await h.pglite.listen(SYNC_JOB_CHANGED_CHANNEL, (id) =>
      heard.push(id),
    );

    expect(await reconcile()).toBe(0);
    expect(await jobOf(job)).toEqual(closed);
    await settle();
    expect(heard).toEqual([]);
    await unlisten();
  });

  it("frees on startup what died while the worker was down", async () => {
    const job = await newSyncJob();
    await h.boss.cancel(QUEUES.sync, job.id);

    // A fixture fetch, because starting the worker also registers the sync
    // consumer, which picks up whatever this file left queued. The harness
    // stops the boss.
    await new Worker({
      boss: h.boss,
      db: h.db,
      sync: { fetch: chessComFixtureFetch() },
      log: testLogger,
    }).start();

    expect(await jobOf(job)).toMatchObject({ status: "failed" });
  });
});
