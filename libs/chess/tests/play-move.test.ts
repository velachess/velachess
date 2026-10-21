import {
  CASTLING_AVAILABLE,
  PAWN_PROMOTION_AVAILABLE,
  STARTING_POSITION,
} from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import { makeFen } from "chessops/fen";

import { playMove, positionFromFen } from "@velachess/chess";

describe("playMove", () => {
  it("plays a legal quiet move", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();

    expect(playMove(pos, "e2", "e4")).toEqual({
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      san: "e4",
    });
  });

  it("refuses the other side's piece, which the board never offered", () => {
    // `legalDestinations` draws nothing on a black pawn while White is to
    // move; accepting the drag anyway would take what was never offered.
    const pos = positionFromFen(STARTING_POSITION).unwrap();

    expect(playMove(pos, "e7", "e5")).toBeNull();
  });

  it("returns null for an illegal move", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    expect(playMove(pos, "e2", "e5")).toBeNull();
  });

  it("returns null from an empty square", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    expect(playMove(pos, "e4", "e5")).toBeNull();
  });

  it("auto-queens a promoting pawn with no promotion argument", () => {
    const pos = positionFromFen(PAWN_PROMOTION_AVAILABLE).unwrap();

    const played = playMove(pos, "a7", "a8");

    expect(played?.san).toBe("a8=Q+");
  });

  it("honors an explicit promotion choice", () => {
    const pos = positionFromFen(PAWN_PROMOTION_AVAILABLE).unwrap();

    const played = playMove(pos, "a7", "a8", "knight");

    expect(played?.san).toBe("a8=N");
  });

  it("plays castling, and names the king's step as an engine would", () => {
    const pos = positionFromFen(CASTLING_AVAILABLE).unwrap();

    const played = playMove(pos, "e1", "g1");

    expect(played?.san).toBe("O-O");
    expect(played?.fen).toContain("R4RK1");
  });

  it("never mutates the position passed in", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    const before = makeFen(pos.toSetup());

    playMove(pos, "e2", "e4");

    expect(makeFen(pos.toSetup())).toBe(before);
  });
});
