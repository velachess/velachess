/**
 * Production entrypoint: postgres-backed deps, the pg-boss worker, graceful
 * shutdown. Same image as the api — different command.
 */

import { createDb } from "@velachess/infra-db";
import { logger } from "@velachess/infra-logger";
import { createBoss } from "@velachess/infra-queue";
import { createRedisClient } from "@velachess/infra-rate-limit";

import { buildProviderSyncRateLimiter } from "./composition/accounts.ts";
import { Worker } from "./worker.ts";

const workerLogger = logger.child({ component: "worker" });

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const redisUrl = process.env["REDIS_URL"];
if (!redisUrl) throw new Error("REDIS_URL is required");

const db = createDb(databaseUrl);
const boss = createBoss(databaseUrl);
boss.on("error", (error) => workerLogger.error({ error }, "pg-boss error"));
const redis = createRedisClient(redisUrl);
redis.on("error", (error: Error) => workerLogger.error({ error }, "redis error"));

// Neither provider publishes a number for this (docs/reference/ingestion.md);
// `groupConcurrency: 1` in worker.ts already rules out the one documented
// risk (chess.com: parallel requests, not frequency, trigger a 429). This
// is a courtesy margin between one job's last call and the next job's
// first, tunable per deployment without a code change.
const providerIntervalsMs = {
  chess_com: Number(process.env["CHESS_COM_MIN_INTERVAL_MS"] ?? 250),
  lichess: Number(process.env["LICHESS_MIN_INTERVAL_MS"] ?? 250),
};

const worker = new Worker({
  boss,
  db,
  log: workerLogger,
  sync: {
    consumeProviderRateLimit: buildProviderSyncRateLimiter(redis, providerIntervalsMs),
  },
});
await worker.start();

workerLogger.info("worker consuming");

async function shutdown() {
  await worker.stop();
  redis.disconnect();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown());
}
