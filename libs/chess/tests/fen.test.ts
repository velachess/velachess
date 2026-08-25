import { STARTING_POSITION } from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import { EMPTY_FEN, INITIAL_FEN, parseFen } from "@velachess/chess";

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
