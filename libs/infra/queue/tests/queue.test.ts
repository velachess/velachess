// @vitest-environment node
import { randomUUID } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";
import {
  ensureQueues,
  makeSyncQueue,
  QUEUES,
  type PgBoss,
  type SyncQueue,
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

const syncJob = (
  id: string,
  accountId = `account-${id}`,
): Parameters<SyncQueue["enqueue"]>[1] => ({
  id,
  accountId,
  platform: "chess_com",
});

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
    await boss.send(QUEUES.sync, {}, { id: last, retryLimit: 0 });
    const fetched = await boss.fetch(QUEUES.sync, { batchSize: 10 });
    expect(fetched.map((job) => job.id)).toContain(last);
    await boss.fail(QUEUES.sync, last);

    expect(await queue.isLive(db, last)).toBe(false);
    const dead = await pglite.query<{ source_id: string }>(
      "select source_id from pgboss.job where name = $1",
      [QUEUES.syncDlq],
    );
    expect(dead.rows.map((row) => row.source_id)).toContain(last);
  });

  it("groups the job by provider, for groupConcurrency to key on", async () => {
    const queue = makeSyncQueue(boss);
    const id = randomUUID();
    await queue.enqueue(db, { id, accountId: `account-${id}`, platform: "lichess" });

    const [row] = (
      await pglite.query<{ group_id: string | null }>(
        "select group_id from pgboss.job where name = $1 and id = $2",
        [QUEUES.sync, id],
      )
    ).rows;
    expect(row?.group_id).toBe("provider:lichess");
  });

  it("waits at least a minute before retrying a failed delivery", async () => {
    // Lichess asks for a full minute after a 429, and pg-boss has one retry
    // delay per queue, so every sync retry honours it.
    const queue = makeSyncQueue(boss);
    const id = randomUUID();
    await queue.enqueue(db, syncJob(id));
    await boss.fail(QUEUES.sync, await deliverSyncJob(boss, id));

    const [row] = (
      await pglite.query<{ state: string; wait_seconds: number }>(
        "select state, extract(epoch from start_after - now())::int as wait_seconds from pgboss.job where name = $1 and id = $2",
        [QUEUES.sync, id],
      )
    ).rows;
    expect(row?.state).toBe("retry");
    expect(row?.wait_seconds).toBeGreaterThanOrEqual(59);
  });

  it("brings a queue created under an older policy up to date on boot", async () => {
    await boss.updateQueue(QUEUES.sync, { retryDelay: 5 });

    await ensureQueues(boss);

    expect((await boss.getQueue(QUEUES.sync))?.retryDelay).toBe(60);
  });

  it("a delivery pg-boss ended is no longer live", async () => {
    const queue = makeSyncQueue(boss);
    const ended = randomUUID();
    await queue.enqueue(db, syncJob(ended));
    await boss.cancel(QUEUES.sync, ended);
    expect(await queue.isLive(db, ended)).toBe(false);
  });

  it("a failing handler retries and then lands in the DLQ", async () => {
    // Job-level retry override: the queue's real schedule (2 tries with
    // backoff) is deliberate production tuning — what this test proves is
    // the retry → deadLetter wiring, so it uses a fast schedule. Sync jobs
    // carry no payload in production; this one does, purely as a marker so
    // the DLQ delivery below can tell this poison job from another test's.
    const marker = randomUUID();
    await boss.send(QUEUES.sync, { marker }, { retryLimit: 1, retryDelay: 1 });

    let attempts = 0;
    const dlqReceived = new Promise<void>((resolve) => {
      void boss.work(QUEUES.sync, async () => {
        attempts++;
        throw new Error("boom");
      });
      void boss.work(QUEUES.syncDlq, async ([job]) => {
        if ((job?.data as { marker?: string } | undefined)?.marker === marker) {
          resolve();
        }
      });
    });

    await dlqReceived;
    // The original attempt plus at least one retry.
    expect(attempts).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
