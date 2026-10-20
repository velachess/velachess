import { describe, expect, it } from "vitest";

import { badgeForCategory, formatBarScore, formatScore } from "../move-presentation.ts";

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

describe("badgeForCategory", () => {
  it("marks the moves worth stopping on", () => {
    expect(badgeForCategory("blunder")).toBe("blunder");
    expect(badgeForCategory("mistake")).toBe("mistake");
    expect(badgeForCategory("inaccuracy")).toBe("inaccuracy");
    expect(badgeForCategory("best")).toBe("ok");
  });

  it("leaves a merely solid move unmarked", () => {
    // A badge on every square is a badge on none.
    expect(badgeForCategory("good")).toBeNull();
  });
});

describe("formatBarScore", () => {
  it("drops the sign, because the bar says the side by where it puts it", () => {
    // The signed reading needed five characters in a bar a fifth that
    // wide, and came out clipped to `+0.` on screen.
    expect(formatBarScore({ cp: 140 })).toBe("1.4");
    expect(formatBarScore({ cp: -140 })).toBe("1.4");
  });

  it("caps the magnitude so it always fits", () => {
    expect(formatBarScore({ cp: 9_999_900 })).toBe("9.9");
    expect(formatBarScore({ cp: -9_999_900 })).toBe("9.9");
  });

  it("says mate rather than a number of pawns", () => {
    expect(formatBarScore({ mate: 3 })).toBe("M3");
    expect(formatBarScore({ mate: -2 })).toBe("M2");
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
      expect(formatBarScore(score).length).toBeLessThanOrEqual(3);
    }
  });
});
