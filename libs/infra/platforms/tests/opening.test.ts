import { describe, expect, it } from "vitest";

import { openingNameFrom } from "../opening.ts";

describe("openingNameFrom", () => {
  it("returns the Opening header when present", () => {
    expect(openingNameFrom({ name: "French Defense" })).toBe("French Defense");
  });

  it("prefers Opening header over URL-derived name", () => {
    expect(
      openingNameFrom({
        name: "London System",
        url: "https://www.chess.com/openings/Some-Other-Opening",
      }),
    ).toBe("London System");
  });

  it("derives name from chess.com ECOUrl slug", () => {
    const url =
      "https://www.chess.com/openings/Closed-Sicilian-Defense-Grand-Prix-Attack-3...g6-4.Bc4";
    expect(openingNameFrom({ url })).toBe("Closed Sicilian Defense Grand Prix Attack");
  });

  it("stops at move-like tokens in the slug", () => {
    const url = "https://www.chess.com/openings/Kings-Pawn-Opening-1.e4";
    expect(openingNameFrom({ url })).toBe("Kings Pawn Opening");
  });

  it("returns null when both name and url are absent", () => {
    expect(openingNameFrom({})).toBeNull();
  });

  it("treats the last path segment as the slug even for non-chess URLs", () => {
    expect(openingNameFrom({ url: "https://example.com" })).toBe("example.com");
  });

  it("returns null when slug is entirely move-like tokens", () => {
    expect(
      openingNameFrom({ url: "https://www.chess.com/openings/1.e4-2.Nf3" }),
    ).toBeNull();
  });
});
