/**
 * Seeding, from both origins.
 *
 * The engine path carries the only real conversion in this package: an
 * engine answers in UCI and an exercise stores SAN, because SAN is what
 * `checkAnswer` compares. Getting that wrong would produce exercises
 * whose "correct" answer nobody can play.
 */
import { describe, expect, it } from "vitest";

import {
  bestMoveAsSan,
  sanAsUci,
  seedFromDeviation,
  seedFromGradedPly,
} from "../exercise.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** The same position without the counters — what an exercise is keyed by. */
const EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

describe("seedFromDeviation", () => {
  it("carries the preparation as the right answer", () => {
    const seed = seedFromDeviation({
      id: "dev-1",
      positionKey: EPD,
      expectedSans: ["Nc3", "Nf3"],
    });

    expect(seed).toEqual({
      positionKey: EPD,
      expectedSans: ["Nc3", "Nf3"],
      origin: { kind: "repertoire-deviation", deviationId: "dev-1" },
    });
  });

  it("declines a deviation with nothing to recall", () => {
    // No prepared answer means no exercise: there is nothing to remember.
    expect(
      seedFromDeviation({ id: "d", positionKey: "epd", expectedSans: [] }),
    ).toBeNull();
    expect(
      seedFromDeviation({ id: "d", positionKey: null, expectedSans: ["Nc3"] }),
    ).toBeNull();
  });
});

describe("seedFromGradedPly", () => {
  it("turns the engine's UCI into the SAN an answer is compared against", () => {
    const seed = seedFromGradedPly({
      gameId: "game-1",
      ply: 7,
      fen: START,
      bestMove: "g1f3",
    });

    expect(seed).toEqual({
      expectedSans: ["Nf3"],
      origin: { kind: "engine-blunder", gameId: "game-1", ply: 7 },
      positionKey: EPD,
    });
  });

  it("declines rather than inventing an unplayable answer", () => {
    // A record drifted from its FEN would otherwise yield an exercise
    // whose correct move is illegal in the position shown.
    expect(
      seedFromGradedPly({
        gameId: "g",
        ply: 1,
        fen: START,
        bestMove: "e7e5",
      }),
    ).toBeNull();
  });

  it("survives a position it cannot even set up", () => {
    expect(
      seedFromGradedPly({
        gameId: "g",
        ply: 1,
        fen: "not a fen",
        bestMove: "g1f3",
      }),
    ).toBeNull();
  });
});

describe("bestMoveAsSan", () => {
  it("names the move a person would write", () => {
    expect(bestMoveAsSan(START, "e2e4")).toBe("e4");
    expect(bestMoveAsSan(START, "g1f3")).toBe("Nf3");
  });

  it("goes quiet on a move that is not legal there", () => {
    expect(bestMoveAsSan(START, "e7e5")).toBeNull();
  });

  it("goes quiet on nonsense rather than throwing", () => {
    expect(bestMoveAsSan(START, "zzzz")).toBeNull();
    expect(bestMoveAsSan("not a fen", "e2e4")).toBeNull();
  });
});

describe("sanAsUci", () => {
  it("is the other direction, for a played move", () => {
    expect(sanAsUci(START, "e4")).toBe("e2e4");
    expect(sanAsUci(START, "Nf3")).toBe("g1f3");
  });

  it("goes quiet when the notation does not fit the position", () => {
    expect(sanAsUci(START, "Qh5xf7")).toBeNull();
    expect(sanAsUci("not a fen", "e4")).toBeNull();
  });
});
