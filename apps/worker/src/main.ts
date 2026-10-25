import { z } from "zod";

import { createDb } from "@velachess/infra-db";
import { logger } from "@velachess/infra-logger";
import { createBoss } from "@velachess/infra-queue";

import { serveLiveness } from "./liveness.ts";
import { Worker } from "./worker.ts";

// Error messages never echo the value: the URL carries a password.
const { DATABASE_URL: databaseUrl, WORKER_HEALTH_PORT: healthPort } = z
  .object({
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: (issue) =>
        issue.input === undefined
          ? "DATABASE_URL is required"
          : "DATABASE_URL must be a postgres:// or postgresql:// URL",
    }),
    WORKER_HEALTH_PORT: z.coerce
      .number({ error: "WORKER_HEALTH_PORT must be an integer between 1 and 65535" })
      .int()
      .min(1)
      .max(65535)
      .default(3003),
  })
  .parse(process.env);

const workerLogger = logger.child({ component: "worker" });

const db = createDb(databaseUrl);
const boss = createBoss(databaseUrl);
boss.on("error", (error) => workerLogger.error({ error }, "pg-boss error"));

const worker = new Worker({ boss, db, log: workerLogger });
await worker.start();
const liveness = await serveLiveness(healthPort);

workerLogger.info({ healthPort }, "worker consuming");

async function shutdown() {
  await worker.stop();
  liveness.close();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown());
}
