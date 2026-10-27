import { describe, expect, it } from "vitest";

import { aGame } from "../../../test/games.ts";
import { formatClock, opponentSideOf } from "../game-presentation.ts";

describe("who you played", () => {
  it("names the other side", () => {
    expect(opponentSideOf(aGame({ perspective: "white" }))).toBe("black");
    expect(opponentSideOf(aGame({ perspective: "black" }))).toBe("white");
  });

  it("has no opponent when nobody knows which side was yours", () => {
    // A pasted PGN we couldn't attribute: the row names both players
    // rather than promoting one of them.
    expect(opponentSideOf(aGame({ perspective: null }))).toBeNull();
  });
});

describe("the clock", () => {
  it("says minutes when the clock divides into them", () => {
    expect(formatClock(600, 0)).toBe("10 min");
    expect(formatClock(60, 0)).toBe("1 min");
  });

  it("keeps seconds when minutes would round away the truth", () => {
    expect(formatClock(30, 0)).toBe("30s");
  });

  it("shows the increment, because 3+2 is not 3 min", () => {
    expect(formatClock(180, 2)).toBe("3 min + 2");
  });

  it("has nothing to say about a game with no clock", () => {
    // Correspondence and pasted PGNs. An invented "0 min" would be a lie.
    expect(formatClock(null, null)).toBeNull();
  });
});
