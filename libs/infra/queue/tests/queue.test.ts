// @vitest-environment node
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";
import {
  makeAnalysisQueue,
  makeSyncQueue,
  QUEUES,
  type PgBoss,
} from "@velachess/infra-queue";
import { createTestDb, deliverSyncJob, startBoss } from "@velachess/test-utils";

let pglite: PGlite;
let boss: PgBoss;
let db: Database;
let closeDb: () => Promise<void>;

beforeAll(async () => {
  ({ pglite, db, close: closeDb } = await createTestDb());
  boss = await startBoss(pglite);
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await closeDb();
});

describe("analysis queue port", () => {
  it("enqueue dedups per game via stately policy", async () => {
    const queue = makeAnalysisQueue(boss, db);
    await queue.enqueue(db, "game-a");
    await queue.enqueue(db, "game-a");
    await queue.enqueue(db, "game-b");

    const rows = await pglite.query<{ singleton_key: string }>(
      "select singleton_key from pgboss.job where name = $1 and state != 'completed'",
      [QUEUES.analysis],
    );
    expect(rows.rows.map((r) => r.singleton_key).toSorted()).toEqual([
      "game-a",
      "game-b",
    ]);
  });

  it("getState reports queued, then none for unknown keys", async () => {
    const queue = makeAnalysisQueue(boss, db);
    await queue.enqueue(db, "game-state");
    expect(await queue.getState("game-state")).toBe("queued");
    expect(await queue.getState("game-unknown")).toBe("none");
  });

  it("enqueue inside a rolled-back transaction leaves no job — atomicity", async () => {
    const queue = makeAnalysisQueue(boss, db);

    await expect(
      db.transaction(async (tx) => {
        await queue.enqueue(tx, "game-rollback");
        throw new Error("domain write failed");
      }),
    ).rejects.toThrow("domain write failed");

    expect(await queue.getState("game-rollback")).toBe("none");
  });

  it("a failing handler retries and then lands in the DLQ", async () => {
    // Job-level retry override: the queue's real schedule (5 tries with
    // backoff ≈ 2.6min) is deliberate production tuning — what this test
    // proves is the retry → deadLetter wiring, so it uses a fast schedule.
    await boss.send(
      QUEUES.analysis,
      { gameId: "game-poison" },
      { singletonKey: "game-poison", retryLimit: 1, retryDelay: 1 },
    );

    let attempts = 0;
    const dlqReceived = new Promise<{ gameId: string }>((resolve) => {
      void boss.work(QUEUES.analysis, async () => {
        attempts++;
        throw new Error("boom");
      });
      void boss.work(QUEUES.analysisDlq, async ([job]) => {
        // earlier tests left other jobs queued on the shared queue; only the
        // poison job proves the retry→DLQ path
        if (!job) return;
        const data = job.data as { gameId: string };
        if (data.gameId === "game-poison") resolve(data);
      });
    });

    const dead = await dlqReceived;
    expect(dead.gameId).toBe("game-poison");
    expect(attempts).toBeGreaterThanOrEqual(2); // original + retries
  }, 60_000);
});

const syncJob = (id: string, accountId = `account-${id}`) => ({ id, accountId });

const jobState = async (id: string) =>
  (
    await pglite.query<{ state: string; retry_count: number }>(
      "select state, retry_count from pgboss.job where name = $1 and id = $2",
      [QUEUES.sync, id],
    )
  ).rows[0];

describe("sync queue port", () => {
  it("sends under the job's own id, and only inside a transaction that commits", async () => {
    const queue = makeSyncQueue(boss);
    const rolledBack = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await queue.enqueue(tx, syncJob(rolledBack));
        throw new Error("job row failed");
      }),
    ).rejects.toThrow("job row failed");
    expect(await queue.isLive(db, rolledBack)).toBe(false);

    const committed = randomUUID();
    await db.transaction((tx) => queue.enqueue(tx, syncJob(committed)));
    expect(await queue.isLive(db, committed)).toBe(true);
  });

  it("refuses to send a second job while one is queued for the account", async () => {
    const queue = makeSyncQueue(boss);
    await queue.enqueue(db, syncJob(randomUUID(), "busy-account"));
    await expect(
      queue.enqueue(db, syncJob(randomUUID(), "busy-account")),
    ).rejects.toThrow(/not enqueued/);
  });

  it("a delivery that failed its last attempt is dead-lettered and no longer live", async () => {
    const queue = makeSyncQueue(boss);
    const last = randomUUID();
    // No retries left: the same path pg-boss takes when a last attempt expires.
    await boss.send(QUEUES.sync, { syncJobId: last }, { id: last, retryLimit: 0 });
    const fetched = await boss.fetch(QUEUES.sync, { batchSize: 10 });
    expect(fetched.map((job) => job.id)).toContain(last);
    await boss.fail(QUEUES.sync, last);

    expect(await queue.isLive(db, last)).toBe(false);
    const dead = await pglite.query<{ data: { syncJobId: string } }>(
      "select data from pgboss.job where name = $1",
      [QUEUES.syncDlq],
    );
    expect(dead.rows.map((row) => row.data.syncJobId)).toContain(last);
  });

  it("settles a delivery only inside a committing transaction, fenced to its attempt", async () => {
    const queue = makeSyncQueue(boss);
    const id = randomUUID();
    await queue.enqueue(db, syncJob(id, "fenced-account"));
    const old = await deliverSyncJob(boss, id);
    // pg-boss's supervisor takes the job back (a missed heartbeat), and a
    // retry picks it up while the old delivery is still running.
    await boss.fail(QUEUES.sync, id, new Error("heartbeat timeout"));
    const current = await deliverSyncJob(boss, id);
    expect([old.retryCount, current.retryCount]).toEqual([0, 1]);

    // The old delivery can neither complete nor fail the retry.
    expect(await queue.complete(db, old)).toBe(false);
    expect(await queue.fail(db, old)).toBe(false);
    expect(await jobState(id)).toEqual({ state: "active", retry_count: 1 });

    await expect(
      db.transaction(async (tx) => {
        expect(await queue.complete(tx, current)).toBe(true);
        throw new Error("writes failed");
      }),
    ).rejects.toThrow("writes failed");
    expect(await jobState(id)).toEqual({ state: "active", retry_count: 1 });

    expect(await db.transaction((tx) => queue.complete(tx, current))).toBe(true);
    expect(await jobState(id)).toMatchObject({ state: "completed" });
  });

  it("a delivery pg-boss ended is no longer live", async () => {
    const queue = makeSyncQueue(boss);
    const ended = randomUUID();
    await queue.enqueue(db, syncJob(ended));
    await boss.cancel(QUEUES.sync, ended);
    expect(await queue.isLive(db, ended)).toBe(false);
  });
});
