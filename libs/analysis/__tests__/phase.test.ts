import { describe, expect, it } from "vitest";

import { gamePhaseOf } from "../phase.ts";

/** Placement-only helper; the classifier reads nothing past the board. */
const fen = (placement: string) => `${placement} w - - 0 1`;

const STARTPOS = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

describe("gamePhaseOf", () => {
  it("calls the initial position an opening", () => {
    expect(gamePhaseOf(fen(STARTPOS))).toBe("opening");
  });

  it("stays an opening through normal early development", () => {
    // 1. e4 e5 2. Nf3 Nc6 — full material, back ranks still ≥ 4 pieces.
    expect(gamePhaseOf(fen("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R"))).toBe(
      "opening",
    );
  });

  it("boundary: 11 majors+minors with full back ranks is still an opening", () => {
    // One knight traded off each side, nothing developed: 12 pieces on
    // each back rank minus the missing knights.
    expect(gamePhaseOf(fen("r1bqkb1r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKB1R"))).toBe(
      "opening",
    );
  });

  it("boundary: exactly 10 majors+minors is a middlegame", () => {
    // Both knights traded: 14 - 4 = 10, back ranks still full enough.
    expect(gamePhaseOf(fen("r1bqkb1r/pppppppp/8/8/8/8/PPPPPPPP/R1BQKB1R"))).toBe(
      "middlegame",
    );
  });

  it("a sparse back rank ends the opening even at full material", () => {
    // Everything developed off White's first rank but king and rooks —
    // three pieces there, below the 4-piece floor.
    expect(gamePhaseOf(fen("rnbqkbnr/pppppppp/8/8/2BNPB2/2NQ4/PPPP1PPP/R3K2R"))).toBe(
      "middlegame",
    );
  });

  it("boundary: exactly 7 majors+minors is still a middlegame", () => {
    // Q+R+B vs R+B+N+N: seven in total.
    expect(gamePhaseOf(fen("4k3/1q1r1b2/8/8/8/8/1R1B1N1N/4K3"))).toBe("middlegame");
  });

  it("boundary: exactly 6 majors+minors is an endgame", () => {
    expect(gamePhaseOf(fen("4k3/1q1r1b2/8/8/8/8/1R1B1N2/4K3"))).toBe("endgame");
  });

  it("calls a king-and-pawn ending an endgame", () => {
    expect(gamePhaseOf(fen("8/5k2/8/8/3P4/3K4/8/8"))).toBe("endgame");
  });

  it("reads only the placement field", () => {
    // Same position, exotic clock/ep fields: irrelevant by construction.
    expect(gamePhaseOf(`${STARTPOS} b KQkq e3 99 42`)).toBe("opening");
  });
});
