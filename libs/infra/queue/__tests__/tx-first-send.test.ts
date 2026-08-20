// @vitest-environment node
/** Regression: the FIRST send after startup, inside a caller transaction,
 * must not deadlock on single-connection backends. */
import { afterAll, beforeAll, expect, it } from "vitest";

import type { Database } from "@velachess/db";
import { makeAnalysisQueue, type PgBoss } from "@velachess/queue";
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
  const queue = makeAnalysisQueue(boss, db);
  await db.transaction(async (tx) => {
    await queue.enqueue(tx, "first-in-tx");
  });
  expect(await queue.getState("first-in-tx")).toBe("queued");
}, 20_000);
