/**
 * The rule that decides how many drills a game contributes.
 *
 * These read as arithmetic, and the reason they are not is in
 * `selection.ts`: a fixed severity floor was measured against real games
 * and fails at both ends of the rating range. Ranking plus a budget is
 * what makes the same rule work for someone who blunders six times a game
 * and someone who blunders twice a month.
 */
import { describe, expect, it } from "vitest";

import { selectDrillCandidates, type DrillablePly } from "../selection.ts";

const ply = (
  n: number,
  category: DrillablePly["category"],
  winChanceLoss: number,
): DrillablePly => ({ ply: n, category, winChanceLoss });

describe("selectDrillCandidates", () => {
  it("takes the costliest first, not the earliest", () => {
    const chosen = selectDrillCandidates(
      [ply(3, "inaccuracy", 0.05), ply(9, "blunder", 0.42), ply(5, "mistake", 0.18)],
      { budget: 2 },
    );

    expect(chosen.map((p) => p.ply)).toEqual([9, 5]);
  });

  it("stops at the budget, however bad the game was", () => {
    const wreck = Array.from({ length: 20 }, (_, i) => ply(i + 1, "blunder", 0.3));

    expect(selectDrillCandidates(wreck, { budget: 5 })).toHaveLength(5);
  });

  it("never drills a move that was fine", () => {
    const clean = [ply(1, "ok", 0.01), ply(2, "ok", 0)];
    expect(selectDrillCandidates(clean)).toEqual([]);
  });

  it("has nothing to offer for a clean game", () => {
    expect(selectDrillCandidates([])).toEqual([]);
  });

  it("respects a raised floor without touching the ranking", () => {
    const plies = [ply(1, "inaccuracy", 0.9), ply(2, "blunder", 0.1)];

    // The inaccuracy cost more, but the floor excludes it entirely — a
    // floor is a gate, not a tiebreak.
    expect(
      selectDrillCandidates(plies, { minSeverity: "blunder" }).map((p) => p.ply),
    ).toEqual([2]);
  });

  it("breaks ties on ply, so the same report yields the same list", () => {
    // Without this the count shown beside the CTA could differ between
    // two reads of one game.
    const tied = [ply(7, "blunder", 0.3), ply(2, "blunder", 0.3)];

    expect(selectDrillCandidates(tied).map((p) => p.ply)).toEqual([2, 7]);
    expect(selectDrillCandidates([...tied].reverse()).map((p) => p.ply)).toEqual([2, 7]);
  });

  it("does not mutate what it was handed", () => {
    const plies = [ply(1, "inaccuracy", 0.05), ply(2, "blunder", 0.4)];
    selectDrillCandidates(plies);
    expect(plies.map((p) => p.ply)).toEqual([1, 2]);
  });

  it("selects nothing when the budget is spent", () => {
    const plies = [ply(1, "blunder", 0.4)];
    expect(selectDrillCandidates(plies, { budget: 0 })).toEqual([]);
  });
});
