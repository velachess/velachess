/** The loop harness: PGlite + real migrations + started pg-boss (queues
 * ensured) + advisory lock. Application, api, and worker suites all run
 * on this — one definition, three consumers. */

import type { PGlite } from "@electric-sql/pglite";

import { sessionAdvisoryLock, type ExecutionLock } from "@velachess/db";
import type { Database } from "@velachess/db";
import {
  createTestBoss,
  ensureQueues,
  makeAnalysisQueue,
  makeSyncQueue,
  type AnalysisQueue,
  type PgBoss,
  type SyncQueue,
} from "@velachess/queue";

import { createTestDb } from "./db.ts";

export interface LoopHarness {
  db: Database;
  pglite: PGlite;
  boss: PgBoss;
  analysisQueue: AnalysisQueue;
  syncQueue: SyncQueue;
  lock: ExecutionLock;
  close(): Promise<void>;
}

export async function startBoss(pglite: PGlite): Promise<PgBoss> {
  const boss = createTestBoss(pglite);
  boss.on("error", () => {});
  await boss.start();
  await ensureQueues(boss);
  return boss;
}

export function pgliteLock(pglite: PGlite): ExecutionLock {
  return sessionAdvisoryLock({
    query: (sql, params) => pglite.query(sql, params as never),
  });
}

export async function createLoopHarness(): Promise<LoopHarness> {
  const { pglite, db, close } = await createTestDb();
  const boss = await startBoss(pglite);

  return {
    db,
    pglite,
    boss,
    analysisQueue: makeAnalysisQueue(boss, db),
    syncQueue: makeSyncQueue(boss, db),
    lock: pgliteLock(pglite),
    close: async () => {
      await boss.stop({ graceful: false });
      await close();
    },
  };
}
