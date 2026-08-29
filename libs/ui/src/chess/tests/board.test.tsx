// @vitest-environment jsdom
/**
 * The wrapper's job is translation: our props in, react-chessboard `options`
 * out. The mock captures the options object the library would receive, so
 * these assertions pin the actual contract.
 *
 * They also pin the *absence* of hand-rolled work — notation, animation and
 * the badge slot are all options, and a regression here would show up as
 * someone reintroducing a hand-positioned overlay.
 */
import { act, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { Board } from "../board.tsx";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface CapturedArrow {
  startSquare: string;
  endSquare: string;
  color: string;
}

interface CapturedOptions {
  position: string;
  boardOrientation: string;
  allowDragging: boolean;
  showAnimations: boolean;
  animationDurationInMs: number;
  showNotation: boolean;
  lightSquareNotationStyle: { color: string };
  darkSquareNotationStyle: { color: string };
  lightSquareStyle: { backgroundColor: string };
  darkSquareStyle: { backgroundColor: string };
  squareStyles: Record<string, { backgroundColor?: string; backgroundImage?: string }>;
  arrows: CapturedArrow[] | undefined;
  clearArrowsOnPositionChange: boolean;
  squareRenderer: (args: { square: string; children?: ReactNode }) => ReactElement;
  onPieceDrop: (args: { sourceSquare: string; targetSquare: string | null }) => boolean;
  onPieceDrag: (args: { square: string }) => void;
  onPieceClick: (args: { piece: unknown; square: string }) => void;
  onSquareClick: (args: { piece: unknown; square: string }) => void;
}

let captured: CapturedOptions;

/**
 * The hint painted on a square, read where it is actually applied.
 *
 * Not `squareStyles`: the library only reads that on its own square div,
 * and a `squareRenderer` replaces that div — so asserting there passed
 * while nothing rendered.
 */
function hintAt(square: string): string | undefined {
  const rendered = captured.squareRenderer({ square });
  const style = (
    rendered.props as { style?: { backgroundImage?: string; backgroundColor?: string } }
  ).style;
  return style?.backgroundImage ?? style?.backgroundColor;
}

vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: CapturedOptions }) => {
    captured = options;
    return <div />;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it("passes the position, orientation and themed squares down", () => {
  render(<Board fen={START} orientation="black" onMove={() => true} />);

  expect(captured.position).toBe(START);
  expect(captured.boardOrientation).toBe("black");
  expect(captured.lightSquareStyle.backgroundColor).toBe("var(--board-light)");
  expect(captured.darkSquareStyle.backgroundColor).toBe("var(--board-dark)");
});

it("lights both squares of the last move", () => {
  render(<Board fen={START} lastMove={{ from: "e2", to: "e4" }} />);

  expect(captured.squareStyles["e2"]!.backgroundColor).toBe("var(--board-highlight)");
  expect(captured.squareStyles["e4"]!.backgroundColor).toBe("var(--board-highlight)");
});

it("asks the library for notation rather than drawing it", () => {
  render(<Board fen={START} />);

  expect(captured.showNotation).toBe(true);
  // Two colours because the legend sits on two backgrounds.
  expect(captured.lightSquareNotationStyle.color).not.toBe(
    captured.darkSquareNotationStyle.color,
  );
});

it("draws the best move at full strength and fades the alternatives", () => {
  render(
    <Board
      fen={START}
      bestMove={{ from: "g1", to: "f3" }}
      alternatives={[
        { from: "d2", to: "d4" },
        { from: "b1", to: "c3" },
      ]}
    />,
  );

  const [best, second, third] = captured.arrows!;
  expect(best).toEqual({
    startSquare: "g1",
    endSquare: "f3",
    color: "var(--move-ok)",
  });
  // `arrowOptions.opacity` is board-wide, so rank has to ride in the
  // colour. Fading, not just different.
  expect(second!.color).toContain("color-mix");
  expect(third!.color).toContain("color-mix");
  expect(second!.color).not.toBe(third!.color);
});

it("draws no arrows at all rather than an empty list", () => {
  render(<Board fen={START} />);
  expect(captured.arrows).toBeUndefined();
});

it("clears user-drawn arrows when the position changes", () => {
  render(<Board fen={START} />);
  // Without this a mark drawn on move 12 is still hanging there on 13.
  expect(captured.clearArrowsOnPositionChange).toBe(true);
});

it("renders a badge only on the square that has one", () => {
  render(<Board fen={START} badges={{ e4: { tone: "blunder", label: "??" } }} />);

  const marked = render(captured.squareRenderer({ square: "e4" }));
  expect(marked.container.textContent).toBe("??");

  const bare = render(captured.squareRenderer({ square: "d4" }));
  expect(bare.container.textContent).toBe("");
});

it("animates by default and holds still on request", () => {
  render(<Board fen={START} />);
  expect(captured.showAnimations).toBe(true);
  expect(captured.animationDurationInMs).toBeGreaterThan(0);

  render(<Board fen={START} animated={false} />);
  expect(captured.showAnimations).toBe(false);
});

it("is not draggable without an onMove handler", () => {
  render(<Board fen={START} />);
  expect(captured.allowDragging).toBe(false);
});

it("is not draggable when explicitly read-only", () => {
  render(<Board fen={START} interactive={false} onMove={() => true} />);
  expect(captured.allowDragging).toBe(false);
});

it("reports a drop as from/to and returns the caller's verdict", () => {
  const onMove = vi.fn().mockReturnValue(false);
  render(<Board fen={START} onMove={onMove} />);

  const accepted = captured.onPieceDrop({ sourceSquare: "e2", targetSquare: "e4" });

  expect(onMove).toHaveBeenCalledWith({ from: "e2", to: "e4" });
  expect(accepted).toBe(false);
});

it("rejects the drop when nobody is listening", () => {
  render(<Board fen={START} />);
  expect(captured.onPieceDrop({ sourceSquare: "e2", targetSquare: null })).toBe(false);
});

/**
 * The dots that say where a piece may go.
 *
 * `react-chessboard` has no notion of legality — it renders squares and
 * reports gestures — so the destinations come from the caller and this
 * only paints them. Both gestures are covered because both are how a
 * person picks a piece up, and wiring only the drag left the dots
 * invisible to anyone who taps.
 */
const KNIGHT_OPENINGS = [
  { square: "a3", isCapture: false },
  { square: "c3", isCapture: false },
];

it("marks nothing until a piece is picked up", () => {
  render(<Board fen={START} legalTargetsOf={() => KNIGHT_OPENINGS} />);

  expect(hintAt("a3")).toBeUndefined();
});

it("marks the legal destinations of a dragged piece", () => {
  render(<Board fen={START} legalTargetsOf={() => KNIGHT_OPENINGS} />);

  act(() => captured.onPieceDrag({ square: "b1" }));

  expect(hintAt("a3")).toContain("radial-gradient");
  expect(hintAt("c3")).toContain("radial-gradient");
});

it("marks them on a click too, so tapping works", () => {
  render(<Board fen={START} legalTargetsOf={() => KNIGHT_OPENINGS} />);

  act(() => captured.onPieceClick({ piece: {}, square: "b1" }));

  expect(hintAt("a3")).toContain("radial-gradient");
});

it("keeps the piece selected when it is clicked again", () => {
  // Re-selecting the same piece is not a move onto itself, and clearing
  // on the second click made a slow double-tap deselect what the person
  // had just chosen.
  render(<Board fen={START} legalTargetsOf={() => KNIGHT_OPENINGS} />);

  act(() => captured.onPieceClick({ piece: {}, square: "b1" }));
  act(() => captured.onPieceClick({ piece: {}, square: "b1" }));

  expect(hintAt("a3")).toBeDefined();
});

it("tells a capture apart from a quiet move", () => {
  // Different shapes, not different colors: a ring around the piece you
  // would take, a dot in the middle of an empty square. Color alone
  // would carry the distinction on its own, which it should not.
  render(
    <Board
      fen={START}
      legalTargetsOf={() => [
        { square: "a3", isCapture: false },
        { square: "a7", isCapture: true },
      ]}
    />,
  );

  act(() => captured.onPieceDrag({ square: "b1" }));

  const quiet = hintAt("a3") ?? "";
  const capture = hintAt("a7") ?? "";
  expect(capture).not.toBe(quiet);
});

it("leaves a board with no hint source unmarked", () => {
  // A replay board is being read, not played; marks on it are noise.
  render(<Board fen={START} />);

  act(() => captured.onPieceDrag({ square: "b1" }));

  expect(Object.keys(captured.squareStyles)).toEqual([]);
});

/**
 * The verdict, drawn instead of written.
 *
 * A drill says "this is what you did, that is what was there" with two
 * arrows in the grade colours the game report already uses — so a mistake
 * looks the same in both places and neither needs a sentence.
 */
it("draws the move that was played beside the one that should have been", () => {
  render(
    <Board
      fen={START}
      playedMove={{ from: "d2", to: "d3" }}
      bestMove={{ from: "b1", to: "c3" }}
    />,
  );

  expect(captured.arrows).toHaveLength(2);
  const [played, best] = captured.arrows ?? [];
  expect(played?.endSquare).toBe("d3");
  expect(best?.endSquare).toBe("c3");
  // Different colours, because they are opposite verdicts on one move.
  expect(played?.color).not.toBe(best?.color);
});

it("draws nothing for a position with no verdict yet", () => {
  render(<Board fen={START} />);

  expect(captured.arrows).toBeUndefined();
});

it("can be told not to show legal moves at all", () => {
  // A harder drill withholds the help without giving up the function
  // that computes it, so the same board serves both.
  render(
    <Board fen={START} showLegalMoves="off" legalTargetsOf={() => KNIGHT_OPENINGS} />,
  );

  act(() => captured.onPieceDrag({ square: "b1" }));

  expect(hintAt("a3")).toBeUndefined();
});

it("marks the square the piece came from", () => {
  render(<Board fen={START} legalTargetsOf={() => KNIGHT_OPENINGS} />);

  act(() => captured.onPieceDrag({ square: "b1" }));

  expect(hintAt("b1")).toBeDefined();
});

/**
 * Click to move: the half of the gesture drag already covers, and the
 * only one a touch screen offers comfortably.
 */
it("plays the move when a legal destination is clicked", () => {
  const onMove = vi.fn(() => true);
  render(<Board fen={START} onMove={onMove} legalTargetsOf={() => KNIGHT_OPENINGS} />);

  act(() => captured.onPieceClick({ piece: {}, square: "b1" }));
  act(() => captured.onSquareClick({ piece: null, square: "c3" }));

  expect(onMove).toHaveBeenCalledWith({ from: "b1", to: "c3" });
});

it("clears the marks once the move is played", () => {
  render(
    <Board fen={START} onMove={() => true} legalTargetsOf={() => KNIGHT_OPENINGS} />,
  );

  act(() => captured.onPieceClick({ piece: {}, square: "b1" }));
  act(() => captured.onSquareClick({ piece: null, square: "c3" }));

  expect(hintAt("a3")).toBeUndefined();
});

it("re-selects instead of moving when another piece is clicked", () => {
  // g1 is not among b1's destinations, so the click chooses it rather
  // than attempting a move onto it.
  const onMove = vi.fn(() => true);
  render(<Board fen={START} onMove={onMove} legalTargetsOf={() => KNIGHT_OPENINGS} />);

  act(() => captured.onPieceClick({ piece: {}, square: "b1" }));
  act(() => captured.onPieceClick({ piece: {}, square: "g1" }));

  expect(onMove).not.toHaveBeenCalled();
  expect(hintAt("g1")).toBeDefined();
});

it("clears the selection when an unreachable empty square is clicked", () => {
  const onMove = vi.fn(() => true);
  render(<Board fen={START} onMove={onMove} legalTargetsOf={() => KNIGHT_OPENINGS} />);

  act(() => captured.onPieceClick({ piece: {}, square: "b1" }));
  act(() => captured.onSquareClick({ piece: null, square: "h6" }));

  expect(onMove).not.toHaveBeenCalled();
  expect(hintAt("a3")).toBeUndefined();
});

it("draws a requested move apart from the grade colours", () => {
  // Green means "this was best" and red "this lost something". A move
  // someone asked to see is neither — it answers a question.
  render(
    <Board
      fen={START}
      bestMove={{ from: "b1", to: "c3" }}
      suggestedMove={{ from: "g1", to: "f3" }}
    />,
  );

  const [suggested, best] = captured.arrows ?? [];
  expect(suggested?.endSquare).toBe("f3");
  expect(suggested?.color).not.toBe(best?.color);
});
