import { STARTING_POSITION } from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import {
  EMPTY_FEN,
  INITIAL_FEN,
  moveNumberOf,
  parseFen,
  positionKeyOf,
} from "@velachess/chess";

describe("FEN", () => {
  it("INITIAL_FEN matches the STARTING_POSITION fixture", () => {
    expect(INITIAL_FEN).toBe(STARTING_POSITION);
  });

  it("parses a Setup without validating legality", () => {
    // Two white kings: syntactically fine FEN, illegal position. parseFen
    // only checks the FEN is well-formed — position.test.ts covers the
    // separate legality check.
    const result = parseFen("8/8/8/8/8/8/8/KK6 w - - 0 1");
    expect(result.isOk).toBe(true);
  });

  it("rejects FEN with the wrong number of fields", () => {
    expect(parseFen("not a fen").isErr).toBe(true);
  });

  it("EMPTY_FEN has no pieces", () => {
    const result = parseFen(EMPTY_FEN);
    expect(result.unwrap().board.occupied.isEmpty()).toBe(true);
  });
});

describe("moveNumberOf", () => {
  it("reads the move number the position belongs to", () => {
    expect(moveNumberOf(STARTING_POSITION)).toBe(1);
    expect(
      moveNumberOf("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2"),
    ).toBe(2);
    expect(moveNumberOf("8/8/8/4k3/8/8/4K3/8 w - - 0 137")).toBe(137);
  });

  it("reads the first move for anything that is not a move number", () => {
    // Legality is checked before a FEN ever reaches here; this is only
    // so a label never renders "NaN".
    expect(moveNumberOf("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -")).toBe(1);
    expect(moveNumberOf(positionKeyOf(STARTING_POSITION))).toBe(1);
    expect(moveNumberOf("8/8/8/4k3/8/8/4K3/8 w - - 0 0")).toBe(1);
    expect(moveNumberOf("8/8/8/4k3/8/8/4K3/8 w - - 0 12abc")).toBe(1);
  });
});
