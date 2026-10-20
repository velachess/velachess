import {
  accountPlatformSchema,
  gameSourceSchema,
  perspectiveSchema,
  resultSchema,
} from "@velachess/infra-platforms";
import { describe, expect, it } from "vitest";

import {
  gameSourceEnum,
  perspectiveEnum,
  platformEnum,
  resultEnum,
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
