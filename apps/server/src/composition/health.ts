import { migrationsApplied, pingDatabase, type Database } from "@velachess/infra-db";
import { logger } from "@velachess/infra-logger";
import { queuesExist, type PgBoss } from "@velachess/infra-queue";

import type { HealthDeps, Readiness } from "../routes/health.ts";

export const READINESS_TIMEOUT_MS = 2000;

export type ReadinessChecks = Record<string, () => Promise<boolean>>;

type CheckResult = Readiness["checks"][string];

const healthLogger = logger.child({ component: "health" });

export function buildReadinessChecks(db: Database, boss: PgBoss): ReadinessChecks {
  return {
    database: () => pingDatabase(db),
    migrations: () => migrationsApplied(db),
    queue: () => queuesExist(boss),
  };
}

export function buildHealthDeps(checks: ReadinessChecks): HealthDeps {
  return {
    async ready() {
      const results: Readiness["checks"] = Object.fromEntries(
        await Promise.all(
          Object.entries(checks).map(async ([name, check]) => [
            name,
            await runCheck(name, check),
          ]),
        ),
      );
      if (Object.values(results).every((result) => result.status === "ok")) {
        return { status: "ready", checks: results };
      }
      return { status: "not_ready", checks: results };
    },
  };
}

async function runCheck(
  name: string,
  check: () => Promise<boolean>,
): Promise<CheckResult> {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), READINESS_TIMEOUT_MS);
  });

  const status = await Promise.race([settle(name, check), timedOut]);
  clearTimeout(timer);
  if (status !== "ok") healthLogger.warn({ check: name, status }, "not ready");

  return { status, latencyMs: Math.round(performance.now() - started) };
}

async function settle(name: string, check: () => Promise<boolean>) {
  try {
    if (await check()) return "ok";
    return "failed";
  } catch (error) {
    healthLogger.warn({ err: error, check: name }, "readiness check threw");
    return "failed";
  }
}
