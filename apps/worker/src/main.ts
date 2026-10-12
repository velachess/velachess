/**
 * Production entrypoint: postgres-backed deps, the pg-boss worker, graceful
 * shutdown. Same image as the api — different command.
 */

import { createRequire } from "node:module";

import postgres from "postgres";

import { sessionAdvisoryLock } from "@velachess/infra-db";
import { createDb } from "@velachess/infra-db";
import { EngineSession } from "@velachess/infra-engine";
import { ChildProcessTransport } from "@velachess/infra-engine/transport-child-process";
import { logger } from "@velachess/infra-logger";
import { createBoss } from "@velachess/infra-queue";

import { Worker } from "./worker.ts";

const require = createRequire(import.meta.url);
const workerLogger = logger.child({ component: "worker" });

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const engineCmd = process.env["ENGINE_CMD"];

async function makeSession(): Promise<EngineSession> {
  const transport = engineCmd
    ? new ChildProcessTransport(engineCmd, [])
    : new ChildProcessTransport(process.execPath, [
        require.resolve("stockfish/bin/stockfish-19-lite-single.js"),
      ]);
  const session = new EngineSession(transport);
  await session.init();
  return session;
}

const db = createDb(databaseUrl);
const boss = createBoss(databaseUrl);
boss.on("error", (error) => workerLogger.error({ error }, "pg-boss error"));

const lockSql = postgres(databaseUrl, { max: 1 });
const lock = sessionAdvisoryLock({
  query: async <T>(sql: string, params?: unknown[]) => {
    const rows = await lockSql.unsafe(sql, (params ?? []) as never[]);
    return { rows: rows as unknown as T[] };
  },
});

const worker = new Worker({
  boss,
  db,
  analyze: { makeSession, tryAcquireLock: (key) => lock.tryAcquire(key) },
  log: workerLogger,
});
await worker.start();

workerLogger.info("worker consuming");

async function shutdown() {
  // In-flight jobs finish, then the pinned lock connection drains
  // (sql.end waits for queries) before exit.
  await worker.stop();
  await lockSql.end({ timeout: 5 });
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown());
}
