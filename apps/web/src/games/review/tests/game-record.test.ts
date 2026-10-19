import { describe, expect, it } from "vitest";

import { fenAtPly, type ReplayMove } from "../game-record.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const move = (ply: number, san: string): ReplayMove => ({
  ply,
  san,
  fenBefore: `before-${ply}`,
  fenAfter: `after-${ply}`,
});

describe("fenAtPly", () => {
  const moves = [move(1, "e4"), move(2, "e5")];

  it("shows the starting position before anyone has moved", () => {
    expect(fenAtPly(moves, START, 0)).toBe(START);
  });

  it("shows the position after the nth half-move", () => {
    expect(fenAtPly(moves, START, 1)).toBe("after-1");
    expect(fenAtPly(moves, START, 2)).toBe("after-2");
  });

  it("clamps rather than falling off either end", () => {
    // A hand-typed URL or a ply held over from a longer game must not
    // produce an undefined position.
    expect(fenAtPly(moves, START, -5)).toBe(START);
    expect(fenAtPly(moves, START, 99)).toBe("after-2");
  });

  it("survives a game with no legal moves at all", () => {
    expect(fenAtPly([], START, 3)).toBe(START);
  });
});
