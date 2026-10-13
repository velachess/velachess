/**
 * Production entrypoint: postgres-backed deps, the pg-boss worker, graceful
 * shutdown. Same image as the api — different command.
 */

import { createDb } from "@velachess/infra-db";
import { logger } from "@velachess/infra-logger";
import { createBoss } from "@velachess/infra-queue";

import { Worker } from "./worker.ts";

const workerLogger = logger.child({ component: "worker" });

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const db = createDb(databaseUrl);
const boss = createBoss(databaseUrl);
boss.on("error", (error) => workerLogger.error({ error }, "pg-boss error"));

const worker = new Worker({ boss, db, log: workerLogger });
await worker.start();

workerLogger.info("worker consuming");

async function shutdown() {
  await worker.stop();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown());
}
