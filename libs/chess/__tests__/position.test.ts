import {
  CASTLING_AVAILABLE,
  EN_PASSANT_AVAILABLE,
  FOOLS_MATE_CHECKMATE,
  STALEMATE_KING_IN_CORNER,
  STARTING_POSITION,
} from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import { makeFen, positionFromFen } from "@velachess/chess";

describe("positionFromFen", () => {
  it("parses and validates a legal position", () => {
    const result = positionFromFen(STARTING_POSITION);
    expect(result.isOk).toBe(true);
    expect(result.unwrap().turn).toBe("white");
  });

  it("round-trips through makeFen", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    expect(makeFen(pos.toSetup())).toBe(STARTING_POSITION);
  });

  it("rejects malformed FEN", () => {
    const result = positionFromFen("not a fen");
    expect(result.isErr).toBe(true);
  });

  it("rejects a well-formed but illegal position (two white kings)", () => {
    const result = positionFromFen("8/8/8/8/8/8/8/KK6 w - - 0 1");
    expect(result.isErr).toBe(true);
  });

  it("detects checkmate", () => {
    const pos = positionFromFen(FOOLS_MATE_CHECKMATE).unwrap();
    expect(pos.isCheckmate()).toBe(true);
    expect(pos.outcome()?.winner).toBe("black");
  });

  it("detects stalemate as a draw, not a checkmate", () => {
    const pos = positionFromFen(STALEMATE_KING_IN_CORNER).unwrap();
    expect(pos.isStalemate()).toBe(true);
    expect(pos.isCheckmate()).toBe(false);
    expect(pos.outcome()?.winner).toBeUndefined();
  });

  it("keeps castling rights distinct from FEN's other position state", () => {
    const pos = positionFromFen(CASTLING_AVAILABLE).unwrap();
    expect(pos.castles.castlingRights.size()).toBe(4);
  });

  it("preserves the en passant target square", () => {
    const pos = positionFromFen(EN_PASSANT_AVAILABLE).unwrap();
    expect(pos.epSquare).toBeDefined();
  });
});
