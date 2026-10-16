import {
  CASTLING_AVAILABLE,
  PAWN_PROMOTION_AVAILABLE,
  STARTING_POSITION,
} from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import { makeFen, playMove, positionFromFen } from "@velachess/chess";

describe("playMove", () => {
  it("plays a legal quiet move", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();

    expect(playMove(pos, "e2", "e4")).toEqual({
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      san: "e4",
      uci: "e2e4",
    });
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
    expect(played?.uci).toBe("a7a8q");
  });

  it("honors an explicit promotion choice", () => {
    const pos = positionFromFen(PAWN_PROMOTION_AVAILABLE).unwrap();

    const played = playMove(pos, "a7", "a8", "knight");

    expect(played?.san).toBe("a8=N");
    expect(played?.uci).toBe("a7a8n");
  });

  it("plays castling — nothing new to prove beyond reusing legalMoveBetween's existing handling", () => {
    const pos = positionFromFen(CASTLING_AVAILABLE).unwrap();

    const played = playMove(pos, "e1", "g1");

    expect(played?.san).toBe("O-O");
    // chessops encodes a castling Move internally as king-takes-own-rook
    // (`to` = the rook's square) — makeUci reads that raw, same as this
    // app's own uciOf() does for the real review's bestMove comparison
    // (libs/analysis/process-analysis/uci.ts). Matching that existing
    // behavior here, not inventing a different one for exploration.
    expect(played?.uci).toBe("e1h1");
  });

  it("never mutates the position passed in", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    const before = makeFen(pos.toSetup());

    playMove(pos, "e2", "e4");

    expect(makeFen(pos.toSetup())).toBe(before);
  });
});
