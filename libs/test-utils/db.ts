/** In-process Postgres with the real migrations — the db every suite
 * above libs/infra/db tests against. (libs/infra/db itself keeps its own
 * dual-backend helper: it sits below this package in the layering.) */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "@velachess/infra-db";
import { schema } from "@velachess/infra-db";

const migrationsFolder = new URL("../infra/db/migrations", import.meta.url).pathname;

export interface TestDb {
  pglite: PGlite;
  db: Database;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const pglite = new PGlite();
  const pgliteDb = drizzle(pglite, { schema });
  await migrate(pgliteDb, { migrationsFolder });
  const db: Database = pgliteDb; // PgDatabase supertype — assignable, no cast
  return { pglite, db, close: () => pglite.close() };
}
