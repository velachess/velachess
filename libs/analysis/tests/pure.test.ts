import { describe, expect, it } from "vitest";

import { classifyMove } from "../process-analysis/classify-move.ts";
import { toWhitePov } from "../score.ts";
import { winChance } from "../winchance.ts";
import { scoreToWinChance } from "../process-analysis/classify-move.ts";

describe("winChance", () => {
  it("is 0 at equality and symmetric around it", () => {
    expect(winChance(0)).toBe(0);
    expect(winChance(100)).toBeCloseTo(-winChance(-100), 10);
  });

  it("is monotonic and saturates mate scores", () => {
    expect(winChance(300)).toBeGreaterThan(winChance(100));
    expect(scoreToWinChance({ mate: 3 })).toBe(winChance(1000));
    expect(scoreToWinChance({ mate: -1 })).toBe(winChance(-1000));
  });
});

describe("toWhitePov", () => {
  it("is identity for white to move", () => {
    expect(toWhitePov({ cp: 42 }, "white")).toEqual({ cp: 42 });
    expect(toWhitePov({ mate: 2 }, "white")).toEqual({ mate: 2 });
  });

  it("flips sign for black to move", () => {
    expect(toWhitePov({ cp: 42 }, "black")).toEqual({ cp: -42 });
    expect(toWhitePov({ mate: 2 }, "black")).toEqual({ mate: -2 });
  });
});

describe("classifyMove", () => {
  const eq = { cp: 0 };

  it("applies the three thresholds at their exact boundaries", () => {
    // cp drops chosen so win-chance loss lands just over each boundary.
    const cases = [
      { after: { cp: -60 }, expected: "inaccuracy" },
      { after: { cp: -115 }, expected: "mistake" },
      { after: { cp: -180 }, expected: "blunder" },
    ] as const;

    for (const c of cases) {
      const { category } = classifyMove({
        before: eq,
        after: c.after,
        mover: "white",
        wasEngineBest: false,
      });
      expect(category).toBe(c.expected);
    }
  });

  it("small loss is good; engine-best wins over any loss", () => {
    expect(
      classifyMove({
        before: eq,
        after: { cp: -20 },
        mover: "white",
        wasEngineBest: false,
      }).category,
    ).toBe("good");
    expect(
      classifyMove({
        before: eq,
        after: { cp: -400 },
        mover: "white",
        wasEngineBest: true,
      }).category,
    ).toBe("best");
  });

  it("classifies black's mistakes identically to white's mirror image", () => {
    const white = classifyMove({
      before: { cp: 0 },
      after: { cp: -180 },
      mover: "white",
      wasEngineBest: false,
    });
    const black = classifyMove({
      before: { cp: 0 },
      after: { cp: 180 },
      mover: "black",
      wasEngineBest: false,
    });
    expect(black.category).toBe(white.category);
    expect(black.winChanceLoss).toBeCloseTo(white.winChanceLoss, 10);
  });

  it("gaining eval is never punished", () => {
    const { category, winChanceLoss } = classifyMove({
      before: eq,
      after: { cp: 200 },
      mover: "white",
      wasEngineBest: false,
    });
    expect(winChanceLoss).toBe(0);
    expect(category).toBe("good");
  });
});
