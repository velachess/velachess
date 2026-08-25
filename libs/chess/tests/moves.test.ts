import {
  CASTLING_AVAILABLE,
  EN_PASSANT_AVAILABLE,
  PAWN_PROMOTION_AVAILABLE,
  STARTING_POSITION,
} from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import {
  isDrop,
  isNormal,
  legalMoves,
  parseSquare,
  positionFromFen,
} from "@velachess/chess";

describe("legalMoves", () => {
  it("finds all 20 legal opening moves", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    const moves = legalMoves(pos);
    expect(moves).toHaveLength(20);
    expect(moves.every(isNormal)).toBe(true);
    expect(moves.some(isDrop)).toBe(false);
  });

  it("scopes to one square when given", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    const moves = legalMoves(pos, parseSquare("e2"));
    expect(moves).toHaveLength(2); // e3, e4
  });

  it("expands a promoting pawn into one move per promotion role", () => {
    const pos = positionFromFen(PAWN_PROMOTION_AVAILABLE).unwrap();
    const from = parseSquare("a7")!;
    const to = parseSquare("a8")!;

    const moves = legalMoves(pos, from);

    expect(moves).toHaveLength(4);
    expect(moves.every((m) => isNormal(m) && m.from === from && m.to === to)).toBe(true);
    expect(new Set(moves.map((m) => (isNormal(m) ? m.promotion : undefined)))).toEqual(
      new Set(["queen", "rook", "bishop", "knight"]),
    );
  });

  it("includes the en passant capture", () => {
    const pos = positionFromFen(EN_PASSANT_AVAILABLE).unwrap();
    const moves = legalMoves(pos, parseSquare("e5"));
    expect(moves.some((m) => isNormal(m) && m.to === parseSquare("f6"))).toBe(true);
  });

  it("represents castling as king-takes-rook, chessops' convention", () => {
    const pos = positionFromFen(CASTLING_AVAILABLE).unwrap();
    const moves = legalMoves(pos, parseSquare("e1"));
    const destinations = moves.filter(isNormal).map((m) => m.to);

    expect(destinations).toContain(parseSquare("h1")); // kingside (O-O)
    expect(destinations).toContain(parseSquare("a1")); // queenside (O-O-O)
  });
});
