import { describe, expect, it } from "vitest";

import { aGradedPly } from "../../../test/games.ts";
import {
  bestMoveSan,
  evalCurve,
  gradeAtPly,
  progressPercent,
  sideOfPly,
  summarize,
  whiteShareOf,
} from "../graded-game.ts";

/**
 * Reading a graded game, without rendering. A screen shows one game, so
 * it walks one path through each rule; the boundaries — the last ply, a
 * mate score, an illegal best move — are only checked here.
 */

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("sideOfPly", () => {
  it("gives odd plies to White and even to Black", () => {
    // The whole seat-attribution of the screen rests on this: get it
    // backwards and every grade lands on the wrong player.
    expect(sideOfPly(1)).toBe("white");
    expect(sideOfPly(2)).toBe("black");
    expect(sideOfPly(7)).toBe("white");
  });
});

describe("summarize", () => {
  it("tallies each grade against the player who played it", () => {
    const graded = [
      aGradedPly(1, { category: "best" }),
      aGradedPly(2, { category: "blunder" }),
      aGradedPly(3, { category: "mistake" }),
      aGradedPly(4, { category: "blunder" }),
    ];

    const breakdown = summarize(graded);

    expect(breakdown.white).toMatchObject({ best: 1, mistake: 1, blunder: 0 });
    expect(breakdown.black).toMatchObject({ best: 0, mistake: 0, blunder: 2 });
    expect(breakdown.graded).toBe(4);
  });

  it("counts nothing before the engine has answered", () => {
    expect(summarize([])).toEqual({
      white: { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
      black: { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
      graded: 0,
    });
  });
});

describe("progressPercent", () => {
  it("reports how much of the game has been graded", () => {
    expect(progressPercent(5, 20)).toBe(25);
    expect(progressPercent(20, 20)).toBe(100);
  });

  it("has nothing to report when the total is unknown", () => {
    // Indeterminate, not zero: a bar pinned at 0% says "stuck", and the
    // ply count is genuinely unknown until the game loads.
    expect(progressPercent(0, 0)).toBeNull();
  });

  it("never exceeds the total, however the stream arrives", () => {
    expect(progressPercent(30, 20)).toBe(100);
  });
});

describe("evalCurve", () => {
  it("turns scores into winning chances, White at the top", () => {
    const curve = evalCurve([
      aGradedPly(1, { evalAfter: { cp: 0 } }),
      aGradedPly(2, { evalAfter: { cp: 900 } }),
      aGradedPly(3, { evalAfter: { cp: -900 } }),
    ]);

    // A level position is the midpoint; a decisive one leans, and is
    // bounded — which is the point of not graphing centipawns.
    expect(curve[0]?.winChance).toBeCloseTo(0.5, 5);
    expect(curve[1]?.winChance).toBeGreaterThan(0.9);
    expect(curve[2]?.winChance).toBeLessThan(0.1);
    expect(curve.every((point) => point.winChance >= 0 && point.winChance <= 1)).toBe(
      true,
    );
  });

  it("takes mate to the ceiling, not to the axis", () => {
    const curve = evalCurve([
      aGradedPly(1, { evalAfter: { mate: 2 } }),
      aGradedPly(2, { evalAfter: { mate: -1 } }),
      // The ceiling itself, reached by centipawns.
      aGradedPly(3, { evalAfter: { cp: 1000 } }),
    ]);

    // This assertion used to read `toBe(1)` and `toBe(0)`, because the
    // curve was implemented twice and this copy saturated. The shared
    // one in `@velachess/analysis` maps mate onto ±1000cp deliberately —
    // it is the behaviour checked against the reference, so it wins.
    // A mate and a crushing-but-finite advantage land on the same point.
    expect(curve[0]?.winChance).toBeCloseTo(curve[2]!.winChance, 10);
    expect(curve[0]?.winChance).toBeLessThan(1);
    expect(curve[1]?.winChance).toBeGreaterThan(0);
    expect(curve[0]!.winChance).toBeGreaterThan(curve[1]!.winChance);
  });

  it("clips beyond the ceiling instead of running away", () => {
    const curve = evalCurve([
      aGradedPly(1, { evalAfter: { cp: 1000 } }),
      aGradedPly(2, { evalAfter: { cp: 100_000 } }),
    ]);

    // Unbounded centipawns are what flattened the graph in the first
    // place; the ceiling is why one absurd score no longer does.
    expect(curve[0]?.winChance).toBeCloseTo(curve[1]!.winChance, 10);
  });
});

describe("bestMoveSan", () => {
  it("turns the engine's UCI answer into notation a person reads", () => {
    const graded = aGradedPly(1, { fen: START, bestMove: "g1f3" });
    expect(bestMoveSan(graded)).toBe("Nf3");
  });

  it("goes quiet rather than throwing on a position it cannot set up", () => {
    // The played move still has to render; only the suggestion drops.
    const graded = aGradedPly(1, { fen: "not a fen", bestMove: "g1f3" });
    expect(bestMoveSan(graded)).toBeNull();
  });

  it("goes quiet on a move that is not legal in the position", () => {
    const graded = aGradedPly(1, { fen: START, bestMove: "e7e5" });
    expect(bestMoveSan(graded)).toBeNull();
  });
});

describe("gradeAtPly", () => {
  const graded = [aGradedPly(3), aGradedPly(4)];

  it("finds the verdict by ply, not by position in the array", () => {
    // The array is a prefix while the analysis streams, so its index is
    // not the ply — reading `graded[ply]` would be off by the whole
    // length of what has not arrived yet.
    expect(gradeAtPly(graded, 3)?.ply).toBe(3);
    expect(gradeAtPly(graded, 4)?.ply).toBe(4);
  });

  it("has nothing to say about a ply the engine has not reached", () => {
    expect(gradeAtPly(graded, 9)).toBeUndefined();
  });
});

describe("whiteShareOf", () => {
  it("puts a level position in the middle", () => {
    expect(whiteShareOf({ cp: 0 })).toBeCloseTo(0.5, 10);
  });

  it("leans the way the advantage does, and stays on the scale", () => {
    expect(whiteShareOf({ cp: 500 })).toBeGreaterThan(0.5);
    expect(whiteShareOf({ cp: -500 })).toBeLessThan(0.5);
    expect(whiteShareOf({ mate: 1 })).toBeLessThanOrEqual(1);
    expect(whiteShareOf({ mate: -1 })).toBeGreaterThanOrEqual(0);
  });
});
