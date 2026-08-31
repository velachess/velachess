/**
 * Production entrypoint: postgres-backed deps, pg-boss consumers, graceful
 * shutdown. Same image as the api — different command.
 */

import { createRequire } from "node:module";

import postgres from "postgres";

import { sessionAdvisoryLock } from "@velachess/infra-db";
import { createDb } from "@velachess/infra-db";
import { EngineSession } from "@velachess/infra-engine";
import { ChildProcessTransport } from "@velachess/infra-engine/transport-child-process";
import { logger } from "@velachess/infra-logger";
import { createBoss, ensureQueues, makeAnalysisQueue } from "@velachess/infra-queue";

import { registerConsumers } from "./worker.ts";

const require = createRequire(import.meta.url);
const workerLogger = logger.child({ component: "worker" });

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const engineCmd = process.env["ENGINE_CMD"];

async function makeSession(): Promise<EngineSession> {
  const transport = engineCmd
    ? new ChildProcessTransport(engineCmd, [])
    : new ChildProcessTransport(process.execPath, [
        require.resolve("stockfish/bin/stockfish-18-lite-single.js"),
      ]);
  const session = new EngineSession(transport);
  await session.init();
  return session;
}

const db = createDb(databaseUrl);
const boss = createBoss(databaseUrl);
boss.on("error", (error) => workerLogger.error({ error }, "pg-boss error"));
await boss.start();
await ensureQueues(boss);

const lockSql = postgres(databaseUrl, { max: 1 });
const lock = sessionAdvisoryLock({
  query: async <T>(sql: string, params?: unknown[]) => {
    const rows = await lockSql.unsafe(sql, (params ?? []) as never[]);
    return { rows: rows as unknown as T[] };
  },
});

// Awaited: if a consumer cannot register, the process dies loudly here
// instead of logging "consuming" over dead workers.
await registerConsumers(boss, {
  db,
  analyze: { makeSession, tryAcquireLock: (key) => lock.tryAcquire(key) },
  analysisQueue: makeAnalysisQueue(boss, db),
  log: workerLogger,
});

workerLogger.info("worker consuming");

async function shutdown() {
  // Graceful: in-flight jobs finish, new fetches stop, then the pinned
  // lock connection drains (sql.end waits for queries) before exit.
  await boss.stop({ graceful: true });
  await lockSql.end({ timeout: 5 });
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown());
}
