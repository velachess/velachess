import { describe, expect, it } from "vitest";

import {
  legalDestinations,
  legalMoveBetween,
  squaresOfSan,
  squaresOfUci,
} from "../moves.ts";
import { positionFromFen } from "../position.ts";

/**
 * What a move indicator is allowed to promise.
 *
 * Legal, not pseudo-legal: a dot on a square a pinned piece cannot reach
 * is worse than no dot, because the person trusts it and the board then
 * refuses the move. These are the rules that a hand-rolled "squares the
 * piece attacks" would get wrong.
 */
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** SAN needs the board it was played on, so tests read through it. */
const sanSquares = (fen: string, san: string) =>
  squaresOfSan(positionFromFen(fen).unwrap(), san);

/** Same position with the other side to move. */
const blackToMove = (fen: string) => fen.replace(" w ", " b ");

const at = (fen: string, square: string) =>
  legalDestinations(positionFromFen(fen).unwrap(), square);

const squares = (fen: string, square: string) =>
  at(fen, square)
    .map((destination) => destination.square)
    .toSorted();

describe("legalDestinations", () => {
  it("offers the knight its two openings from the start", () => {
    expect(squares(START, "b1")).toEqual(["a3", "c3"]);
  });

  it("gives a pinned piece only the moves that keep the king safe", () => {
    // The knight on e2 is pinned to the king on e1 by the rook on e8. It
    // attacks six squares and may legally reach none of them.
    const pinned = "4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1";

    expect(squares(pinned, "e2")).toEqual([]);
  });

  it("marks a capture as a capture", () => {
    // Black pawn on d5, white pawn on e4: exd5 takes.
    const takes = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";

    expect(at(takes, "e4")).toContainEqual({ square: "d5", isCapture: true });
    expect(at(takes, "e4")).toContainEqual({ square: "e5", isCapture: false });
  });

  it("calls en passant a capture even though the square is empty", () => {
    // Black has just played f7-f5; exf6 takes a pawn that is not on f6.
    // Asking "is the destination occupied" answers no, and gets it wrong.
    const enPassant = "4k3/8/8/4Pp2/8/8/8/4K3 w - f6 0 1";

    expect(at(enPassant, "e5")).toContainEqual({ square: "f6", isCapture: true });
  });

  it("offers castling where chessops puts it: the rook's square", () => {
    // chessops encodes castling as the king taking its own rook, so the
    // destination is h1 and not g1. Written down rather than translated,
    // because `legalMoveBetween` normalises a drag to g1 into this same
    // move — the library owns both ends of that mapping.
    const canCastle = "4k3/8/8/8/8/8/8/4K2R w K - 0 1";

    expect(squares(canCastle, "e1")).toContain("h1");
  });

  it("accepts the king dragged to g1 as that castling move", () => {
    const canCastle = "4k3/8/8/8/8/8/8/4K2R w K - 0 1";
    const position = positionFromFen(canCastle).unwrap();

    expect(legalMoveBetween(position, "e1", "g1")).not.toBeNull();
  });

  it("refuses a move that is not legal, however plausible", () => {
    const position = positionFromFen(START).unwrap();

    expect(legalMoveBetween(position, "e2", "e5")).toBeNull();
  });

  it("collapses a promotion into one square", () => {
    // Four moves, one destination: a dot marks a square, not a choice of
    // piece. Listing it four times would draw four dots on one square.
    const promoting = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";

    expect(squares(promoting, "a7")).toEqual(["a8"]);
  });

  it("has nothing to offer from an empty square", () => {
    expect(squares(START, "e4")).toEqual([]);
  });

  it("has nothing to offer for a square that is not one", () => {
    expect(squares(START, "z9")).toEqual([]);
  });
});

describe("squaresOfUci", () => {
  it("splits an engine move into the two squares it touches", () => {
    expect(squaresOfUci("g1f3")).toEqual({ from: "g1", to: "f3" });
  });

  it("ignores the promotion suffix, which is not a square", () => {
    expect(squaresOfUci("e7e8q")).toEqual({ from: "e7", to: "e8" });
  });

  it("refuses anything too short to be a move", () => {
    expect(squaresOfUci("e2")).toBeNull();
  });
});

describe("squaresOfSan", () => {
  it("names the squares a played move touched", () => {
    expect(sanSquares(START, "e4")).toEqual({ from: "e2", to: "e4" });
    expect(sanSquares(START, "Nf3")).toEqual({ from: "g1", to: "f3" });
  });

  it("renders castling on the king's destination, not the rook's square", () => {
    // chessops encodes castling as the king taking its own rook (e1h1);
    // a board drawing the move wants the square the king lands on — which
    // is also what an engine's UCI would name (issue #3).
    const castling = "r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1";

    expect(sanSquares(castling, "O-O")).toEqual({ from: "e1", to: "g1" });
    expect(sanSquares(castling, "O-O-O")).toEqual({ from: "e1", to: "c1" });
    expect(sanSquares(blackToMove(castling), "O-O")).toEqual({
      from: "e8",
      to: "g8",
    });
    expect(sanSquares(blackToMove(castling), "O-O-O")).toEqual({
      from: "e8",
      to: "c8",
    });
  });

  it("gives nothing when the move does not fit the position", () => {
    // A record drifted from its FEN would otherwise light two squares
    // chosen at random, which is worse than lighting none.
    expect(sanSquares(START, "Qh5xf7")).toBeNull();
  });

  it("yields nothing for a move that is not legal here", () => {
    // A record drifted from its FEN would otherwise highlight two squares
    // that have nothing to do with what was played.
    expect(sanSquares(START, "Nf6")).toBeNull();
  });
});
