/**
 * Reference-alignment suite: every case here mirrors public Lichess
 * source or its own test suite, same inputs and expected values.
 *
 * - Win% formula: lichess.org/page/accuracy + scalachess
 *   core/src/main/scala/eval.scala (`fromCentiPawns`)
 * - Move accuracy: lila modules/analyze/src/main/AccuracyPercent.scala
 *   (`fromWinPercents`, exact constants, +1 uncertainty bonus)
 * - Game accuracy cases: same file's `gameAccuracy`; math helpers from
 *   `lichess-org/scalalib` (`Maths.scala`); expected values from
 *   `lila modules/analyze/src/test/AccuracyPercentTest.scala`, ported
 *   verbatim with the same `isCloseTo` tolerances
 */
import { describe, expect, it } from "vitest";

import { gameAccuracy, moveAccuracy } from "../accuracy.ts";
import { winPercent } from "../win-percent.ts";

function isCloseTo(a: number, b: number, delta: number) {
  expect(Math.abs(a - b), `expected ${a} within ${delta} of ${b}`).toBeLessThanOrEqual(
    delta,
  );
}

function winPercentReference(cp: number) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function accuracyReference(diff: number) {
  return Math.min(
    100,
    Math.max(
      0,
      103.1668100711649 * Math.exp(-0.04354415386753951 * diff) - 3.166924740191411 + 1,
    ),
  );
}

const compute = (cps: number[]) => gameAccuracy("white", cps);
const computeBlack = (cps: number[]) => gameAccuracy("black", cps);

describe("winPercent — matches the published formula", () => {
  it("reproduces Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)", () => {
    for (const cp of [-800, -300, -100, 0, 50, 100, 300, 800]) {
      isCloseTo(winPercent(cp), winPercentReference(cp), 1e-9);
    }
  });
});

describe("move accuracy — matches AccuracyPercent.fromWinPercents", () => {
  it("is 100 when no win% was lost", () => {
    expect(moveAccuracy(50, 50)).toBe(100);
    expect(moveAccuracy(50, 80)).toBe(100);
  });

  it("reproduces the exact published curve (with the +1 uncertainty bonus)", () => {
    for (const diff of [1, 5, 10, 20, 40, 60, 90]) {
      isCloseTo(moveAccuracy(80, 80 - diff), accuracyReference(diff), 1e-9);
    }
  });
});

describe("game accuracy — AccuracyPercentTest.scala ported verbatim", () => {
  it("empty game", () => {
    expect(compute([])).toBeNull();
  });

  it("single move", () => {
    expect(compute([15])).toBeNull();
  });

  it("two good moves", () => {
    const a = compute([15, 15])!;
    isCloseTo(a.white, 100, 1);
    isCloseTo(a.black, 100, 1);
  });

  it("white blunders on first move", () => {
    const a = compute([-900, -900])!;
    isCloseTo(a.white, 10, 5);
    isCloseTo(a.black, 100, 1);
  });

  it("black blunders on first move", () => {
    const a = compute([15, 900])!;
    isCloseTo(a.white, 100, 1);
    isCloseTo(a.black, 10, 5);
  });

  it("both blunder on first move", () => {
    const a = compute([-900, 0])!;
    isCloseTo(a.white, 10, 5);
    isCloseTo(a.black, 10, 5);
  });

  it("20 perfect moves", () => {
    const a = compute(Array(20).fill(15))!;
    isCloseTo(a.white, 100, 1);
    isCloseTo(a.black, 100, 1);
  });

  it("20 perfect moves and a white blunder", () => {
    const a = compute([...Array(20).fill(15), -900])!;
    isCloseTo(a.white, 50, 5);
    isCloseTo(a.black, 100, 1);
  });

  it("21 perfect moves and a black blunder", () => {
    const a = compute([...Array(21).fill(15), 900])!;
    isCloseTo(a.white, 100, 1);
    isCloseTo(a.black, 50, 5);
  });

  it("5 average moves (65 cpl) on each side", () => {
    const a = compute(Array.from({ length: 5 }, () => [-50, 15]).flat())!;
    isCloseTo(a.white, 76, 8);
    isCloseTo(a.black, 76, 8);
  });

  it("50 average moves (65 cpl) on each side", () => {
    const a = compute(Array.from({ length: 50 }, () => [-50, 15]).flat())!;
    isCloseTo(a.white, 76, 8);
    isCloseTo(a.black, 76, 8);
  });

  it("50 mediocre moves (150 cpl) on each side", () => {
    const a = compute(Array.from({ length: 50 }, () => [-135, 15]).flat())!;
    isCloseTo(a.white, 54, 8);
    isCloseTo(a.black, 54, 8);
  });

  it("50 terrible moves (500 cpl) on each side", () => {
    const a = compute(Array.from({ length: 50 }, () => [-435, 15]).flat())!;
    isCloseTo(a.white, 20, 8);
    isCloseTo(a.black, 20, 8);
  });

  it("black moves first, empty game", () => {
    expect(computeBlack([])).toBeNull();
  });

  it("black moves first, single move", () => {
    expect(computeBlack([15])).toBeNull();
  });

  it("black moves first, two good moves", () => {
    const a = computeBlack([15, 15])!;
    isCloseTo(a.black, 100, 1);
    isCloseTo(a.white, 100, 1);
  });

  it("black moves first, black blunders on first move", () => {
    const a = computeBlack([900, 900])!;
    isCloseTo(a.black, 10, 5);
    isCloseTo(a.white, 100, 1);
  });

  it("black moves first, white blunders on first move", () => {
    const a = computeBlack([15, -900])!;
    isCloseTo(a.black, 100, 1);
    isCloseTo(a.white, 10, 5);
  });

  it("black moves first, both blunder on first move", () => {
    const a = computeBlack([900, 0])!;
    isCloseTo(a.black, 10, 5);
    isCloseTo(a.white, 10, 5);
  });
});
