// @vitest-environment node
/**
 * Drift guard for a mirror the dependency rules mandate.
 *
 * `resultSchema` here feeds the `game_result` pgEnum, and `libs/chess`
 * declares the same four markers for `gameOutcomeFor`. The chess package
 * cannot import this one — it is the pure package `apps/web` bundles, and
 * this one carries provider HTTP clients — so the two are checked mutually
 * assignable at typecheck instead, from the package that depends on both.
 */
import type { GameResult } from "@velachess/chess";
import { expect, it } from "vitest";

import { resultSchema, type GameResult as StoredGameResult } from "../schema.ts";

const toChessResult: GameResult = {} as StoredGameResult;
const fromChessResult: StoredGameResult = {} as GameResult;
void toChessResult;
void fromChessResult;

it("the stored result vocabulary is exactly four markers", () => {
  // The type guard above cannot see a *missing* member, so the count is
  // asserted too: dropping `"*"` from one side alone would still compile.
  expect(resultSchema.options).toHaveLength(4);
});
