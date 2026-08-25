import { describe, expect, it } from "vitest";

import { COLORS, makeSquare, opposite, parseSquare, ROLES } from "@velachess/chess";

describe("vocabulary", () => {
  it("round-trips square names through parseSquare/makeSquare", () => {
    for (const name of ["a1", "e4", "h8"] as const) {
      expect(makeSquare(parseSquare(name)!)).toBe(name);
    }
  });

  it("rejects an out-of-board square name", () => {
    expect(parseSquare("i9")).toBeUndefined();
  });

  it("flips color", () => {
    expect(opposite("white")).toBe("black");
    expect(opposite("black")).toBe("white");
  });

  it("lists the standard 6 roles and 2 colors", () => {
    expect(ROLES).toHaveLength(6);
    expect(COLORS).toHaveLength(2);
  });
});
