import { describe, expect, it } from "vitest";

import { adherenceMetrics } from "../adherence.ts";

describe("adherenceMetrics", () => {
  const rows = [
    { type: "completed", inBookPlies: 10, gamePlies: 40, result: "win" },
    { type: "book-ended", inBookPlies: 8, gamePlies: 30, result: "loss" },
    { type: "gap", inBookPlies: 4, gamePlies: 25, result: "draw" },
    { type: "deviation", inBookPlies: 6, gamePlies: 50, result: "loss" },
    { type: "deviation", inBookPlies: 2, gamePlies: 35, result: "win" },
    { type: "deviation", inBookPlies: 1, gamePlies: 4 }, // below the floor
  ] as const;

  it("computes counts, rates, and prep depth over judged games only", () => {
    const m = adherenceMetrics([...rows]);

    expect(m.judgedGames).toBe(5);
    expect(m.skippedGames).toBe(1);
    expect(m.faithfulGames).toBe(3);
    expect(m.adherenceRate).toBeCloseTo(3 / 5, 10);
    expect(m.averagePrepDepth).toBeCloseTo((10 + 8 + 4 + 6 + 2) / 5, 10);

    expect(m.inBook).toEqual({ total: 3, wins: 1, draws: 1, losses: 1, winRate: 1 / 3 });
    expect(m.outOfBook).toEqual({
      total: 2,
      wins: 1,
      draws: 0,
      losses: 1,
      winRate: 1 / 2,
    });
  });

  it("ignores missing results in win rates without dropping the game from totals", () => {
    const m = adherenceMetrics([
      { type: "completed", inBookPlies: 6, gamePlies: 20 },
      { type: "completed", inBookPlies: 6, gamePlies: 20, result: "win" },
    ]);
    expect(m.inBook.total).toBe(2);
    expect(m.inBook.winRate).toBe(1);
  });

  it("is all zeros on an empty list — no NaN", () => {
    const m = adherenceMetrics([]);
    expect(m.judgedGames).toBe(0);
    expect(m.adherenceRate).toBe(0);
    expect(m.averagePrepDepth).toBe(0);
    expect(m.inBook.winRate).toBe(0);
  });

  it("respects a custom floor", () => {
    const m = adherenceMetrics([{ type: "completed", inBookPlies: 3, gamePlies: 10 }], {
      minJudgedPlies: 12,
    });
    expect(m.judgedGames).toBe(0);
    expect(m.skippedGames).toBe(1);
  });
});
