import { STARTING_POSITION } from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import { INITIAL_FEN } from "@velachess/chess";

describe("FEN", () => {
  // The only thing worth asserting about a re-export: that our own
  // fixture still says what chessops says.
  it("INITIAL_FEN matches the STARTING_POSITION fixture", () => {
    expect(INITIAL_FEN).toBe(STARTING_POSITION);
  });
});
