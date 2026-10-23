import { describe, expect, it } from "vitest";

import { legalDestinations, playMove, squaresOfSan, squaresOfUci } from "../moves.ts";
import { positionFromFen } from "../position.ts";

/**
 * Legal, not pseudo-legal: a dot on a square a pinned piece cannot reach is
 * worse than no dot, because the person trusts it and the board then
 * refuses the move. A hand-rolled "squares the piece attacks" gets these
 * wrong.
 */
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const sanSquares = (fen: string, san: string) =>
  squaresOfSan(positionFromFen(fen).unwrap(), san);

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
    // The e2 knight is pinned by the e8 rook: six squares attacked, none
    // reachable.
    const pinned = "4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1";

    expect(squares(pinned, "e2")).toEqual([]);
  });

  it("marks a capture as a capture", () => {
    const takes = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";

    expect(at(takes, "e4")).toContainEqual({ square: "d5", isCapture: true });
    expect(at(takes, "e4")).toContainEqual({ square: "e5", isCapture: false });
  });

  it("calls en passant a capture even though the square is empty", () => {
    // exf6 takes a pawn that is not on f6, so "is the destination occupied"
    // answers no and gets it wrong.
    const enPassant = "4k3/8/8/4Pp2/8/8/8/4K3 w - f6 0 1";

    expect(at(enPassant, "e5")).toContainEqual({ square: "f6", isCapture: true });
  });

  it("offers castling on the square the king lands on, not the rook's", () => {
    // chessops encodes castling as the king taking its own rook (e1h1), but
    // the dot has to sit where the king lands, which is where a person
    // drags.
    const canCastle = "4k3/8/8/8/8/8/8/4K2R w K - 0 1";

    expect(squares(canCastle, "e1")).toContain("g1");
    expect(squares(canCastle, "e1")).not.toContain("h1");
  });

  it("does not call castling a capture, though the rook's square is occupied", () => {
    const canCastle = "4k3/8/8/8/8/8/8/4K2R w K - 0 1";

    expect(at(canCastle, "e1")).toContainEqual({ square: "g1", isCapture: false });
  });

  it("refuses a move that is not legal, however plausible", () => {
    const position = positionFromFen(START).unwrap();

    expect(playMove(position, "e2", "e5")).toBeNull();
  });

  it("collapses a promotion into one square", () => {
    // Four moves, one destination: listing it four times draws four dots on
    // one square.
    const promoting = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";

    expect(squares(promoting, "a7")).toEqual(["a8"]);
  });

  it("has nothing to offer from an empty square", () => {
    expect(squares(START, "e4")).toEqual([]);
  });

  it("has nothing to offer for a square that is not one", () => {
    expect(squares(START, "z9")).toEqual([]);
  });

  it("offers nothing for the side that is not to move", () => {
    // Dots for the side not to move promise what `playMove` refuses.
    expect(squares(START, "e7")).toEqual([]);
  });
});

/**
 * Every square the board offers has to be one the move accepts, and the
 * other way round. These drifted apart once: destinations were computed for
 * either side while the move allowed only the side to play.
 */
function playsEverythingOffered(fen: string, from: string) {
  const offered = squares(fen, from);
  const accepted = offered.filter(
    (to) => playMove(positionFromFen(fen).unwrap(), from, to) !== null,
  );
  return { offered, accepted };
}

describe("what is offered is what is accepted", () => {
  it("holds for White's pieces", () => {
    const { offered, accepted } = playsEverythingOffered(START, "e2");

    expect(offered).not.toEqual([]);
    expect(accepted).toEqual(offered);
  });

  it("holds for Black's pieces, on Black's turn", () => {
    const { offered, accepted } = playsEverythingOffered(blackToMove(START), "e7");

    expect(offered).toEqual(["e5", "e6"]);
    expect(accepted).toEqual(offered);
  });

  it("offers neither side's pieces when it is not their turn", () => {
    expect(squares(START, "e7")).toEqual([]);
    expect(squares(blackToMove(START), "e2")).toEqual([]);
  });

  it("holds for a capture", () => {
    const takes = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";
    const { offered, accepted } = playsEverythingOffered(takes, "e4");

    expect(offered).toContain("d5");
    expect(accepted).toEqual(offered);
    expect(playMove(positionFromFen(takes).unwrap(), "e4", "d5")?.san).toBe("exd5");
  });

  it("holds for castling, both sides and both wings", () => {
    const both = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";

    for (const [fen, from, wings] of [
      [both, "e1", { g1: "O-O", c1: "O-O-O" }],
      [blackToMove(both), "e8", { g8: "O-O", c8: "O-O-O" }],
    ] as const) {
      const { offered, accepted } = playsEverythingOffered(fen, from);
      expect(accepted).toEqual(offered);

      for (const [square, san] of Object.entries(wings)) {
        expect(offered).toContain(square);
        expect(playMove(positionFromFen(fen).unwrap(), from, square)?.san).toBe(san);
      }
    }
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
    // The square the king lands on, which is also what an engine's UCI
    // names (issue #3).
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
    // A record drifted from its FEN would light two arbitrary squares,
    // which is worse than lighting none.
    expect(sanSquares(START, "Qh5xf7")).toBeNull();
  });

  it("yields nothing for a move that is not legal here", () => {
    expect(sanSquares(START, "Nf6")).toBeNull();
  });
});
