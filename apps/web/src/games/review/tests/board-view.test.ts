import { describe, expect, it } from "vitest";

import { squaresOfUci } from "@velachess/chess";

import { aReplay } from "../../../test/games.ts";
import { legalTargetsAt, sanOfUciAt, seatOf } from "../board-view.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Defaulting to white put anyone who played black behind the wrong pieces
 * on every unlabelled game. */
describe("seatOf", () => {
  const game = { perspective: null, whiteName: "magnuscarlsen", blackName: "yurimutti" };

  it("trusts the stored perspective", () => {
    expect(seatOf({ ...game, perspective: "black" }, ["magnuscarlsen"])).toBe("black");
  });

  it("finds your seat from the names when there is none stored", () => {
    expect(seatOf(game, ["yurimutti"])).toBe("black");
  });

  it("matches a username whatever its case", () => {
    expect(seatOf(game, ["YuriMutti"])).toBe("black");
  });

  it("faces white when nothing identifies you", () => {
    expect(seatOf(game, ["someoneelse"])).toBe("white");
    expect(seatOf(game, [])).toBe("white");
  });
});

describe("legalTargetsAt", () => {
  it("offers every square the piece on it can reach", () => {
    expect(legalTargetsAt(START, "e2").map((target) => target.square)).toEqual([
      "e3",
      "e4",
    ]);
  });

  it("offers nothing for the side that is not to move", () => {
    // A variation is a game being played, and it is White's turn.
    expect(legalTargetsAt(START, "e7")).toEqual([]);
  });

  it("has nothing to offer from an empty square", () => {
    expect(legalTargetsAt(START, "e4")).toEqual([]);
  });

  it("stays quiet on a position it cannot set up, rather than throwing", () => {
    expect(legalTargetsAt("not a fen", "e2")).toEqual([]);
  });
});

describe("sanOfUciAt", () => {
  it("turns the engine's UCI answer into notation a person reads", () => {
    expect(sanOfUciAt(START, "g1f3")).toBe("Nf3");
  });

  it("goes quiet rather than throwing on a position it cannot set up", () => {
    // The played move still renders; only the suggestion drops.
    expect(sanOfUciAt("not a fen", "g1f3")).toBeNull();
  });

  it("goes quiet on a move that is not legal in the position", () => {
    expect(sanOfUciAt(START, "e7e5")).toBeNull();
  });

  it("goes quiet when the engine named no move at all", () => {
    expect(sanOfUciAt(START, "")).toBeNull();
  });
});

/**
 * `use-board-review.ts` reads the two lit squares off the replay's own UCI
 * rather than parsing the position back out of a FEN. These are the cases
 * where the notations disagree, or a suffix could be mistaken for a square.
 */
/**
 * Kings and rooks only, and one game per side: after White castles short
 * the rook covers f8, which makes Black's own short castle illegal.
 */
const castling = (turn: "w" | "b", movetext: string) =>
  aReplay(
    `[Event "C"]\n[SetUp "1"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R ${turn} KQkq - 0 1"]\n\n${movetext}`,
  ).moves[0]!;

describe("the last move, as the replay already named it", () => {
  it("lights the king's squares when castling short, not the rook's", () => {
    // chessops encodes castling as king-takes-own-rook (e1h1), but a board
    // draws the king's two-square step.
    expect(squaresOfUci(castling("w", "1. O-O *").uci)).toEqual({ from: "e1", to: "g1" });
    expect(squaresOfUci(castling("b", "1... O-O *").uci)).toEqual({
      from: "e8",
      to: "g8",
    });
  });

  it("lights the king's squares when castling long", () => {
    expect(squaresOfUci(castling("w", "1. O-O-O *").uci)).toEqual({
      from: "e1",
      to: "c1",
    });
    expect(squaresOfUci(castling("b", "1... O-O-O *").uci)).toEqual({
      from: "e8",
      to: "c8",
    });
  });

  it("ignores a promotion suffix, which is not a square", () => {
    const [promotion] = aReplay(
      '[Event "C"]\n[SetUp "1"]\n[FEN "8/P6k/8/8/8/8/8/K7 w - - 0 1"]\n\n1. a8=Q *',
    ).moves;

    expect(promotion!.uci).toBe("a7a8q");
    expect(squaresOfUci(promotion!.uci)).toEqual({ from: "a7", to: "a8" });
  });

  it("reads a game that starts from a position, with Black to play", () => {
    const [first] = aReplay(
      '[Event "C"]\n[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 20"]\n\n20... Nf6 *',
    ).moves;

    expect(first!.side).toBe("black");
    expect(first!.moveNumber).toBe(20);
    expect(squaresOfUci(first!.uci)).toEqual({ from: "g8", to: "f6" });
  });
});
