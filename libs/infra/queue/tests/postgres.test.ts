// @vitest-environment node
/**
 * The sync enqueue on the production driver path: pg-boss SQL bound through
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

  it("sends only inside a transaction that commits, and reads the delivery's state back", async () => {
    const rolledBack = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await queue.enqueue(tx, {
          id: rolledBack,
          accountId: `account-${rolledBack}`,
          platform: "chess_com",
        });
        throw new Error("job row failed");
      }),
    ).rejects.toThrow("job row failed");
    expect(await queue.isLive(db, rolledBack)).toBe(false);

    const id = randomUUID();
    await db.transaction((tx) =>
      queue.enqueue(tx, { id, accountId: `account-${id}`, platform: "chess_com" }),
    );
    expect(await queue.isLive(db, id)).toBe(true);

    const delivery = await deliverSyncJob(boss, id);
    expect(delivery.id).toBe(id);
    await boss.complete(QUEUES.sync, delivery);
    expect(await queue.isLive(db, id)).toBe(false);
  });
});
