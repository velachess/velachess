import {
  latestBundledMigration,
  migrationsApplied,
  pingDatabase,
  type Database,
} from "@velachess/infra-db";
import { logger } from "@velachess/infra-logger";
import { queuesExist, type PgBoss } from "@velachess/infra-queue";

import type { HealthDeps, Readiness } from "../routes/health.ts";

export const READINESS_TIMEOUT_MS = 2000;

const healthLogger = logger.child({ component: "health" });

export function buildReadinessChecks(db: Database, boss: PgBoss) {
  const latestMigration = latestBundledMigration();
  return {
    database: () => pingDatabase(db),
    migrations: () => migrationsApplied(db, latestMigration),
    queue: () => queuesExist(boss),
  };
}

export function buildHealthDeps(
  checks: ReturnType<typeof buildReadinessChecks>,
): HealthDeps {
  return {
    async ready() {
      const [database, migrations, queue] = await Promise.all([
        runCheck("database", checks.database),
        runCheck("migrations", checks.migrations),
        runCheck("queue", checks.queue),
      ]);
      const results = { database, migrations, queue };
      if ([database, migrations, queue].every((result) => result.status === "ok")) {
        return { status: "ready", checks: results };
      }
      return { status: "not_ready", checks: results };
    },
  };
}

async function runCheck(
  name: string,
  check: () => Promise<boolean>,
): Promise<Readiness["checks"]["database"]> {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), READINESS_TIMEOUT_MS);
  });

  const outcome = await Promise.race([check(), timedOut]).catch(
    (error: unknown) => error,
  );
  clearTimeout(timer);
  const latencyMs = Math.round(performance.now() - started);

  if (outcome === true) return { status: "ok", latencyMs };
  if (outcome === "timeout") {
    healthLogger.warn({ check: name }, "readiness check timed out");
    return { status: "timeout", latencyMs };
  }
  healthLogger.warn({ check: name, error: outcome }, "readiness check failed");
  return { status: "failed", latencyMs };
}
