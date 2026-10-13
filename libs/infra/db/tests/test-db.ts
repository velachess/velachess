/**
 * Test database factory. Uses DATABASE_URL when present (docker-compose
 * Postgres); falls back to PGlite (in-process Postgres) so the suite runs
 * anywhere. Both paths apply the real migrations from ./migrations —
 * the schema under test is the schema that ships.
 */

import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import type { Database } from "../client.ts";
import * as schema from "../schema.ts";
import { users } from "../schema.ts";

const migrationsFolder = new URL("../migrations", import.meta.url).pathname;

export async function createTestDb(): Promise<{
  db: Database;
  /** LISTEN on a channel, as the API does: postgres.js opens a connection
   * of its own for it, PGlite listens on its one session. Resolves to the
   * unlisten. */
  listen: (
    channel: string,
    onNotify: (payload: string) => void,
  ) => Promise<() => Promise<void>>;
  close: () => Promise<void>;
}> {
  const url = process.env["DATABASE_URL"];

  if (url) {
    const client = postgres(url, { max: 1 });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder });
    return {
      db,
      listen: async (channel, onNotify) =>
        (await client.listen(channel, onNotify)).unlisten,
      close: () => client.end(),
    };
  }

  const pglite = new PGlite();
  const pgliteDb = drizzlePglite(pglite, { schema });
  await migratePglite(pgliteDb, { migrationsFolder });
  const db: Database = pgliteDb;
  return {
    db,
    listen: (channel, onNotify) => pglite.listen(channel, onNotify),
    close: () => pglite.close(),
  };
}

/**
 * Every owned row hangs from a user — games included, since ownership
 * became direct. Tests that don't care whose user it is still need one.
 */
export async function createUserRow(db: Database): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      displayName: "Test User",
      email: `${randomUUID()}@test.local`,
    })
    .returning({ id: users.id });
  return user!.id;
}
