// @vitest-environment node
/** Regression: the FIRST send after startup, inside a caller transaction,
 * must not deadlock on single-connection backends. */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";
import { makeSyncQueue, type PgBoss } from "@velachess/infra-queue";
import { createTestDb, startBoss } from "@velachess/test-utils";

let boss: PgBoss;
let db: Database;
let closeDb: () => Promise<void>;

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  closeDb = t.close;
  boss = await startBoss(t.pglite);
});

afterAll(async () => {
  await boss.stop({ graceful: false });
  await closeDb();
});

it("first enqueue ever, inside a transaction, completes", async () => {
  const queue = makeSyncQueue(boss);
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await queue.enqueue(tx, { id, accountId: "first-in-tx" });
  });
  expect(await queue.isLive(db, id)).toBe(true);
}, 20_000);
