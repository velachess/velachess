// @vitest-environment node
/**
 * The sync settle on the production driver path: pg-boss SQL bound through
 * drizzle on postgres-js, which PGlite does not exercise. Runs only against
 * a Postgres server (`DATABASE_URL`); CI's Postgres job runs it.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Database } from "@velachess/infra-db";
import {
  createBoss,
  ensureQueues,
  makeSyncQueue,
  QUEUES,
  type PgBoss,
  type SyncQueue,
} from "@velachess/infra-queue";
import { deliverSyncJob } from "@velachess/test-utils";

const url = process.env["DATABASE_URL"];

describe.skipIf(!url)("sync settle on Postgres", () => {
  let boss: PgBoss;
  let db: Database;
  let queue: SyncQueue;
  beforeAll(async () => {
    boss = createBoss(url!);
    boss.on("error", () => {});
    await boss.start();
    await ensureQueues(boss);
    db = createDb(url!);
    queue = makeSyncQueue(boss);
  });
  afterAll(() => boss.stop({ graceful: false }));

  it("an old delivery can neither complete nor fail the retry; the retry settles in its transaction", async () => {
    const id = randomUUID();
    await queue.enqueue(db, { id, accountId: `account-${id}` });
    const old = await deliverSyncJob(boss, id);
    await boss.fail(QUEUES.sync, id);
    const current = await deliverSyncJob(boss, id);

    expect(await queue.complete(db, old)).toBe(false);
    expect(await queue.fail(db, old)).toBe(false);
    expect(await queue.isLive(db, id)).toBe(true);

    await expect(
      db.transaction(async (tx) => {
        expect(await queue.fail(tx, current)).toBe(true);
        throw new Error("writes failed");
      }),
    ).rejects.toThrow("writes failed");
    expect(await db.transaction((tx) => queue.fail(tx, current))).toBe(true);
    expect(await queue.isLive(db, id)).toBe(true);

    const last = await deliverSyncJob(boss, id);
    expect(last.retryCount).toBe(2);
    expect(await db.transaction((tx) => queue.complete(tx, last))).toBe(true);
    expect(await queue.isLive(db, id)).toBe(false);
  });
});
