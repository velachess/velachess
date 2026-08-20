import { describe, expect, it } from "vitest";

import { formatClock, opponentOf, outcomeOf } from "../columns.tsx";
import type { Game } from "../queries.ts";

const game = (overrides: Partial<Game> = {}): Game => ({
  id: "g1",
  whiteName: "yurimutti",
  whiteRating: 348,
  blackName: "kalipere",
  blackRating: 142,
  result: "1-0",
  playedAt: "2026-08-16T12:00:00Z",
  perspective: "white",
  source: "chess_com",
  externalUrl: null,
  timeControlInitialSeconds: 600,
  timeControlIncrementSeconds: 0,
  openingName: "French Defense",
  ...overrides,
});

describe("who you played", () => {
  it("names the other side, with their rating", () => {
    expect(opponentOf(game())).toEqual({ name: "kalipere", rating: 142 });
    expect(opponentOf(game({ perspective: "black" }))).toEqual({
      name: "yurimutti",
      rating: 348,
    });
  });

  it("falls back to the black seat when nobody knows which side was yours", () => {
    // A pasted PGN we couldn't attribute. Showing *a* name beats showing none.
    expect(opponentOf(game({ perspective: null })).name).toBe("kalipere");
  });
});

describe("how it went", () => {
  it("reads the scoresheet from your seat", () => {
    // "1-0" is a win for white and a loss for black — the same row means
    // opposite things depending on which side you were.
    expect(outcomeOf(game({ perspective: "white", result: "1-0" }))).toBe("win");
    expect(outcomeOf(game({ perspective: "black", result: "1-0" }))).toBe("loss");
    expect(outcomeOf(game({ perspective: "white", result: "0-1" }))).toBe("loss");
    expect(outcomeOf(game({ perspective: "black", result: "0-1" }))).toBe("win");
  });

  it("calls a draw a draw from either seat", () => {
    expect(outcomeOf(game({ perspective: "white", result: "1/2-1/2" }))).toBe("draw");
    expect(outcomeOf(game({ perspective: "black", result: "1/2-1/2" }))).toBe("draw");
  });

  it("won't guess a winner it can't know", () => {
    expect(outcomeOf(game({ result: "*" }))).toBe("unfinished");
    expect(outcomeOf(game({ perspective: null }))).toBe("unfinished");
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
