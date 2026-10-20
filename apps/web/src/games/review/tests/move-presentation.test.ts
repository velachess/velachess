import { describe, expect, it } from "vitest";

import {
  CATEGORY_BADGE,
  evaluationOf,
  formatScore,
  whiteShareOf,
} from "../move-presentation.ts";

/**
 * How a verdict reads on screen. The boundaries — a mate score, an empty
 * score, a magnitude past the bar's width — are only checked here.
 */

describe("formatScore", () => {
  it("reads centipawns as pawns, signed from White's side", () => {
    expect(formatScore({ cp: 140 })).toBe("+1.4");
    expect(formatScore({ cp: -35 })).toBe("−0.3");
    expect(formatScore({ cp: 0 })).toBe("0.0");
  });

  it("says mate rather than converting it to a number of pawns", () => {
    // A mate rendered as centipawns is the bug that makes every other
    // move on the graph look flat.
    expect(formatScore({ mate: 3 })).toBe("M3");
    expect(formatScore({ mate: -2 })).toBe("−M2");
  });

  it("treats an empty score as level", () => {
    expect(formatScore({})).toBe("0.0");
  });
});

describe("CATEGORY_BADGE", () => {
  it("marks the moves worth stopping on", () => {
    expect(CATEGORY_BADGE.blunder).toBe("blunder");
    expect(CATEGORY_BADGE.mistake).toBe("mistake");
    expect(CATEGORY_BADGE.inaccuracy).toBe("inaccuracy");
    expect(CATEGORY_BADGE.best).toBe("ok");
  });

  it("leaves a merely solid move unmarked", () => {
    // A badge on every square is a badge on none.
    expect(CATEGORY_BADGE.good).toBeUndefined();
  });
});

describe("the bar's reading", () => {
  it("drops the sign, because the bar says the side by where it puts it", () => {
    // The signed reading needed five characters in a bar a fifth that
    // wide, and came out clipped to `+0.` on screen.
    expect(evaluationOf({ cp: 140 }).label).toBe("1.4");
    expect(evaluationOf({ cp: -140 }).label).toBe("1.4");
  });

  it("caps the magnitude so it always fits", () => {
    expect(evaluationOf({ cp: 9_999_900 }).label).toBe("9.9");
    expect(evaluationOf({ cp: -9_999_900 }).label).toBe("9.9");
  });

  it("says mate rather than a number of pawns", () => {
    expect(evaluationOf({ mate: 3 }).label).toBe("M3");
    expect(evaluationOf({ mate: -2 }).label).toBe("M2");
  });

  it("never exceeds three characters, which is what the bar holds", () => {
    const readings = [
      { cp: 0 },
      { cp: -12_345 },
      { cp: 99 },
      { mate: 1 },
      { mate: -99 },
      {},
    ];
    for (const score of readings) {
      expect(evaluationOf(score).label.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("whiteShareOf", () => {
  it("puts a level position in the middle", () => {
    expect(whiteShareOf({ cp: 0 })).toBeCloseTo(0.5, 10);
  });

  it("leans the way the advantage does, and stays on the scale", () => {
    expect(whiteShareOf({ cp: 900 })).toBeGreaterThan(0.9);
    expect(whiteShareOf({ cp: -900 })).toBeLessThan(0.1);
    expect(whiteShareOf({ cp: 500 })).toBeGreaterThan(0.5);
    expect(whiteShareOf({ cp: -500 })).toBeLessThan(0.5);
  });

  it("takes mate to the ceiling, not to the axis", () => {
    // Mate maps onto the ±1000cp ceiling, so it lands on the same point
    // as a crushing-but-finite advantage rather than saturating.
    expect(whiteShareOf({ mate: 2 })).toBeCloseTo(whiteShareOf({ cp: 1000 }), 10);
    expect(whiteShareOf({ mate: 2 })).toBeLessThan(1);
    expect(whiteShareOf({ mate: -1 })).toBeGreaterThan(0);
    expect(whiteShareOf({ mate: 2 })).toBeGreaterThan(whiteShareOf({ mate: -1 }));
  });

  it("clips beyond the ceiling instead of running away", () => {
    expect(whiteShareOf({ cp: 100_000 })).toBeCloseTo(whiteShareOf({ cp: 1000 }), 10);
  });
});
