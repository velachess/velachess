/**
 * The only file family that touches pg-boss. Everything else — including
 * apps — speaks ports and queue names.
 */

import type { PGlite } from "@electric-sql/pglite";
import { PgBoss, fromPglite } from "pg-boss";

export function createBoss(databaseUrl: string): PgBoss {
  return new PgBoss(databaseUrl);
}

/** In-process boss for the zero-service test suite. */
export function createTestBoss(pglite: PGlite): PgBoss {
  return new PgBoss({ db: fromPglite(pglite) });
}

export type { PgBoss };
