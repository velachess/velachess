import { describe, expect, it } from "vitest";

import { openingFamily } from "../opening-family.ts";

describe("openingFamily", () => {
  it("takes the family before the colon of a full opening name", () => {
    expect(openingFamily("Sicilian Defense: Najdorf Variation", null)).toBe(
      "Sicilian Defense",
    );
  });

  it("returns a name without a colon as-is", () => {
    expect(openingFamily("King's Indian Attack", null)).toBe("King's Indian Attack");
  });

  it("prefers the name over the url when both exist", () => {
    expect(
      openingFamily(
        "Caro-Kann Defense: Advance Variation",
        "https://www.chess.com/openings/French-Defense",
      ),
    ).toBe("Caro-Kann Defense");
  });

  it("reads a chess.com slug up to the family marker", () => {
    expect(
      openingFamily(
        null,
        "https://www.chess.com/openings/Sicilian-Defense-Bowdler-Attack-2.Bc4-e6",
      ),
    ).toBe("Sicilian Defense");
  });

  it("stops at the move tail when no marker precedes it", () => {
    expect(openingFamily(null, "https://www.chess.com/openings/Bird-2.Nf3")).toBe("Bird");
  });

  it("stops at a numbered move even mid-slug", () => {
    expect(
      openingFamily(
        null,
        "https://www.chess.com/openings/Vienna-Game-Max-Lange-Defense-3.Bc4-Nf6-4.O-O",
      ),
    ).toBe("Vienna Game");
  });

  it("falls back to the first three words of an unknown shape", () => {
    expect(
      openingFamily(
        null,
        "https://www.chess.com/openings/Queens-Pawn-Accelerated-London",
      ),
    ).toBe("Queens Pawn Accelerated");
  });

  it("is null when neither name nor url carries anything", () => {
    expect(openingFamily(null, null)).toBeNull();
    expect(openingFamily(null, "")).toBeNull();
    expect(openingFamily(null, "https://www.chess.com/openings/2.Bc4-e6")).toBeNull();
  });

  it("is null for a name that is only a colon", () => {
    expect(openingFamily(": ", null)).toBeNull();
  });
});
