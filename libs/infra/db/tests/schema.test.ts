import {
  accountPlatformSchema,
  gameSourceSchema,
  perspectiveSchema,
  resultSchema,
} from "@velachess/infra-platforms";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  gameSourceEnum,
  perspectiveEnum,
  platformEnum,
  resultEnum,
  schema as tables,
  users,
} from "@velachess/infra-db";

/**
 * Every `pgEnum` is built from a zod schema's `.options`, so Postgres and
 * the application cannot disagree about a column's domain. These assert
 * the derivation rather than trusting it: a literal typed back into the
 * schema file by hand would still compile.
 */
describe("enum derivation", () => {
  it.each([
    ["game_source", gameSourceEnum, gameSourceSchema],
    ["perspective", perspectiveEnum, perspectiveSchema],
    ["game_result", resultEnum, resultSchema],
    ["platform", platformEnum, accountPlatformSchema],
  ])("%s matches its zod source exactly", (_name, enumColumn, schema) => {
    expect(enumColumn.enumValues).toEqual(schema.options);
  });

  it("keeps `platform` a strict subset of `source` — a paste has no account", () => {
    // Not the same list on purpose: `pgn` is a game source with no
    // archive to walk and no profile to ask about.
    expect(gameSourceSchema.options).toContain("pgn");
    expect(accountPlatformSchema.options).not.toContain("pgn");
    for (const platform of accountPlatformSchema.options) {
      expect(gameSourceSchema.options).toContain(platform);
    }
  });
});

/**
 * Deleting an account is one `DELETE FROM users`: a table that names a user
 * without cascading would make it fail, or outlive the person it belongs to.
 */
describe("what a user owns", () => {
  it("every foreign key to users cascades on delete", () => {
    const toUsers = Object.values(tables)
      .filter((table) => is(table, PgTable))
      .flatMap((table) => {
        const config = getTableConfig(table);
        return config.foreignKeys
          .filter((key) => key.reference().foreignTable === users)
          .map((key) => ({ table: config.name, onDelete: key.onDelete }));
      })
      .toSorted((a, b) => a.table.localeCompare(b.table));

    expect(toUsers).toEqual(
      ["auth_accounts", "games", "sessions", "sync_jobs", "tracked_accounts"].map(
        (table) => ({ table, onDelete: "cascade" }),
      ),
    );
  });
});
