import { fileURLToPath } from "node:url";

import { max, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { bigint, pgSchema } from "drizzle-orm/pg-core";

import type { Database } from "./client.ts";

const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

const appliedMigrations = pgSchema("drizzle").table("__drizzle_migrations", {
  createdAt: bigint("created_at", { mode: "number" }),
});

export async function pingDatabase(db: Database) {
  await db.execute(sql`select 1`);
  return true;
}

export function latestBundledMigration() {
  return Math.max(
    ...readMigrationFiles({ migrationsFolder }).map(
      (migration) => migration.folderMillis,
    ),
  );
}

export async function migrationsApplied(db: Database, latest: number) {
  const [row] = await db
    .select({ applied: max(appliedMigrations.createdAt) })
    .from(appliedMigrations);
  return (row?.applied ?? 0) >= latest;
}
