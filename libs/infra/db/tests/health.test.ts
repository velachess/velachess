import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { migrationsApplied, pingDatabase } from "../health.ts";
import { createTestDb } from "./test-db.ts";

class Rollback extends Error {}

describe("database health", () => {
  it("pings a reachable database", async () => {
    const { db, close } = await createTestDb();
    try {
      await expect(pingDatabase(db)).resolves.toBe(true);
    } finally {
      await close();
    }
  });

  it("reports the bundled migrations as applied on a migrated database", async () => {
    const { db, close } = await createTestDb();
    try {
      await expect(migrationsApplied(db)).resolves.toBe(true);
    } finally {
      await close();
    }
  });

  it("reports a missing latest migration", async () => {
    const { db, close } = await createTestDb();
    try {
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(
            sql`delete from drizzle.__drizzle_migrations
                 where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`,
          );
          expect(await migrationsApplied(tx)).toBe(false);
          throw new Rollback();
        }),
      ).rejects.toBeInstanceOf(Rollback);
      await expect(migrationsApplied(db)).resolves.toBe(true);
    } finally {
      await close();
    }
  });
});
