// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";
import { makeAnalysisQueue, QUEUES, type PgBoss } from "@velachess/infra-queue";
import { createTestDb, startBoss } from "@velachess/test-utils";

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
