/**
 * Reference-alignment suite: every case here mirrors public Lichess
 * source or its own test suite, same inputs and expected values.
 *
 * - Win% formula and constants: lichess.org/page/accuracy +
 *   scalachess core/src/main/scala/eval.scala (winningChances,
 *   fromCentiPawns with ±1000 ceiling, fromMate via the ceiling)
 * - Judgment thresholds: lila modules/tree Advice.scala (CpAdvice:
 *   winning-chance delta ≥ .1 inaccuracy, ≥ .2 mistake, ≥ .3 blunder)
 *
 * The move/game accuracy port's own reference suite lives in
 * `tests/accuracy.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { classifyMove, scoreToWinChance } from "../process-analysis/classify-move.ts";
import { winChance } from "../winchance.ts";

function isCloseTo(a: number, b: number, delta: number) {
  expect(Math.abs(a - b), `expected ${a} within ${delta} of ${b}`).toBeLessThanOrEqual(
    delta,
  );
}

function winPercentReference(cp: number) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function cpForDrop(drop: number): number {
  // White-POV cp after the move so winChance falls just past `drop`.
  let lo = -1000;
  let hi = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (winChance(0) - winChance(mid) > drop) lo = mid;
    else hi = mid;
  }
  return lo;
}

describe("Win% — matches the published formula", () => {
  it("reproduces winChance = 2 / (1 + exp(-0.00368208 * cp)) - 1, scaled to Win%", () => {
    for (const cp of [-800, -300, -100, 0, 50, 100, 300, 800]) {
      isCloseTo(50 + 50 * winChance(cp), winPercentReference(cp), 1e-9);
    }
  });

  it("ceils centipawns at ±1000 like the reference (no runaway values)", () => {
    expect(winChance(5000)).toBe(winChance(1000));
    expect(winChance(-5000)).toBe(winChance(-1000));
  });

  it("maps mate scores through the ±1000 cp ceiling, not to a saturated ±1", () => {
    expect(scoreToWinChance({ mate: 3 })).toBe(winChance(1000));
    expect(scoreToWinChance({ mate: -1 })).toBe(winChance(-1000));
    expect(scoreToWinChance({ mate: 3 })).toBeLessThan(1);
  });
});

describe("judgment thresholds — match CpAdvice", () => {
  // CpAdvice: delta = winningChances drop from the mover's POV;
  // ≥ .3 blunder, ≥ .2 mistake, ≥ .1 inaccuracy, below that no advice.
  const cases = [
    { drop: 0.09, expected: "good" },
    { drop: 0.1, expected: "inaccuracy" },
    { drop: 0.2, expected: "mistake" },
    { drop: 0.3, expected: "blunder" },
  ] as const;

  it("classifies exactly at the reference boundaries", () => {
    for (const c of cases) {
      const after = cpForDrop(c.drop);
      const { category } = classifyMove({
        before: { cp: 0 },
        after: { cp: after },
        mover: "white",
        wasEngineBest: false,
      });
      expect(category, `drop ${c.drop}`).toBe(c.expected);
    }
  });
});
