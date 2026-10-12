/** The loop harness: PGlite + real migrations + started pg-boss (queues
 * ensured) + advisory lock. Application, api, and worker suites all run
 * on this — one definition, three consumers. */

import type { PGlite } from "@electric-sql/pglite";

import { sessionAdvisoryLock, type ExecutionLock } from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import {
  createTestBoss,
  ensureQueues,
  makeSyncQueue,
  QUEUES,
  type Job,
  type PgBoss,
  type SyncQueue,
} from "@velachess/infra-queue";

import { createTestDb } from "./db.ts";

export interface LoopHarness {
  db: Database;
  pglite: PGlite;
  boss: PgBoss;
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
    query: (sql, params) => pglite.query(sql, params),
  });
}

export async function createLoopHarness(): Promise<LoopHarness> {
  const { pglite, db, close } = await createTestDb();
  const boss = await startBoss(pglite);

  return {
    db,
    pglite,
    boss,
    syncQueue: makeSyncQueue(boss),
    lock: pgliteLock(pglite),
    close: async () => {
      await boss.stop({ graceful: false });
      await close();
    },
  };
}

/** Raised per call, so the job just picked always outranks earlier picks. */
let pickPriority = 1_000_000;

/**
 * One sync job's delivery, fetched from pg-boss the way a worker gets it
 * (active, with a signal of its own), but picked by id: the job is moved
 * ahead of the queue first, so the fetch claims it and nothing else.
 */
export async function deliverSyncJob(boss: PgBoss, id: string): Promise<Job> {
  pickPriority += 1;
  await boss.update(QUEUES.sync, undefined, { id, priority: pickPriority });
  const [job] = await boss.fetch<object>(QUEUES.sync, {
    ignoreStartAfter: true,
    minPriority: pickPriority,
  });
  if (job?.id !== id) throw new Error(`sync job ${id} has no delivery waiting`);
  return { ...job, signal: new AbortController().signal };
}
