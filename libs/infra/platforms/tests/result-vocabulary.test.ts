// @vitest-environment node
/**
 * Drift guard for a mirror the dependency rules mandate.
 *
 * `resultSchema` here feeds the `game_result` pgEnum, and `libs/chess`
 * declares the same four markers for `gameOutcomeFor`. The chess package
 * cannot import this one — it is the pure package `apps/web` bundles, and
 * this one carries provider HTTP clients — so the two are checked equal at
 * typecheck instead, from the package that depends on both.
 */
import type { GameResult } from "@velachess/chess";
import { expect, expectTypeOf, it } from "vitest";

import { resultSchema, type GameResult as StoredGameResult } from "../schema.ts";

it("the stored result vocabulary is the chess package's four markers", () => {
  expectTypeOf<StoredGameResult>().toEqualTypeOf<GameResult>();
  expect(resultSchema.options).toHaveLength(4);
});
