/**
 * Test database factory. Uses DATABASE_URL when present (docker-compose
 * Postgres); falls back to PGlite (in-process Postgres) so the suite runs
 * anywhere. Both paths apply the real migrations from ./migrations —
 * the schema under test is the schema that ships.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import type { Database } from "../client.ts";
import * as schema from "../schema.ts";

const migrationsFolder = new URL("../migrations", import.meta.url).pathname;

export async function createTestDb(): Promise<{
  db: Database;
  close: () => Promise<void>;
}> {
  const url = process.env["DATABASE_URL"];

  if (url) {
    const client = postgres(url, { max: 1 });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder });
    return { db, close: () => client.end() };
  }

  const pglite = new PGlite();
  const pgliteDb = drizzlePglite(pglite, { schema });
  await migratePglite(pgliteDb, { migrationsFolder });
  const db: Database = pgliteDb;
  return { db, close: () => pglite.close() };
}
