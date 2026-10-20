/**
 * The only file family that touches pg-boss. Everything else — including
 * apps — speaks ports and queue names.
 */

import type { PGlite } from "@electric-sql/pglite";
import { PgBoss, fromPglite, type Job } from "pg-boss";

export function createBoss(databaseUrl: string): PgBoss {
  return new PgBoss(databaseUrl);
}

/** In-process boss for the zero-service test suite. `backend: "pglite"`
 * is pg-boss's own named compatibility profile for this exact adapter —
 * without it, pg-boss assumes standard Postgres and some of its schema
 * (the `job_common` table a grouped `send` needs) never gets created. */
export function createTestBoss(pglite: PGlite): PgBoss {
  return new PgBoss({ db: fromPglite(pglite), backend: "pglite" });
}

export type { Job, PgBoss };
