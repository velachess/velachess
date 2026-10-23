// @vitest-environment jsdom
/**
 * Our props in, react-chessboard `options` out. The mock captures the
 * options the library would receive, pinning that contract and the absence
 * of hand-rolled work.
 *
 * What the library does with them is not assertable here, and asserting it
 * here hid two bugs: every rendered result lives in
 * `board-render.test.tsx`. The exception is dragging, which needs a pointer
 * and a layout jsdom lacks, so those callbacks are driven through the mock.
 */
import { act, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { Board } from "../board.tsx";
import { badgeEdgesOf } from "../board-theme.ts";

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
  arrows: CapturedArrow[] | undefined;
  arrowOptions: {
    arrowLengthReducerDenominator: number;
    arrowStartOffset: number;
    opacity: number;
  };
  clearArrowsOnPositionChange: boolean;
  squareRenderer: (args: {
    square: string;
    children?: ReactNode;
  }) => ReactElement<{ style?: SquareFill }>;
  onPieceDrop: (args: { sourceSquare: string; targetSquare: string | null }) => boolean;
  onPieceDrag: (args: { square: string }) => void;
}

let captured: CapturedOptions;

interface SquareFill {
  backgroundImage?: string;
  backgroundColor?: string;
}

function fillAt(square: string): SquareFill {
  return captured.squareRenderer({ square }).props.style ?? {};
}

// Only the component is stubbed: the wrapper builds its arrow geometry on
// the module's own constants, and a stand-in would drift from them.
vi.mock("react-chessboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-chessboard")>()),
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

it("asks the library for notation rather than drawing it", () => {
  render(<Board fen={START} />);

  expect(captured.showNotation).toBe(true);
  expect(captured.lightSquareNotationStyle.color).not.toBe(
    captured.darkSquareNotationStyle.color,
  );
});

it("draws a requested move apart from the grade colours", () => {
  // Green means "best" and red "lost something"; a move someone asked to
  // see is neither.
  render(
    <Board
      fen={START}
      bestMove={{ from: "b1", to: "c3" }}
      suggestedMove={{ from: "g1", to: "f3" }}
    />,
  );

  const [suggested, best] = captured.arrows ?? [];
  expect(best).toEqual({
    startSquare: "b1",
    endSquare: "c3",
    color: "var(--move-ok)",
  });
  expect(suggested?.endSquare).toBe("f3");
  expect(suggested?.color).not.toBe(best?.color);
});

it("draws no arrows at all rather than an empty list", () => {
  render(<Board fen={START} />);
  expect(captured.arrows).toBeUndefined();
});

it("clears user-drawn arrows when the position changes", () => {
  render(<Board fen={START} />);
  // Without it a mark drawn on move 12 hangs there on 13.
  expect(captured.clearArrowsOnPositionChange).toBe(true);
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

  render(<Board fen={START} onMove={() => true} />);
  expect(captured.allowDragging).toBe(true);
});

it("marks the destinations of a dragged piece", () => {
  render(
    <Board
      fen={START}
      onMove={() => true}
      legalTargetsOf={() => [{ square: "a3", isCapture: false }]}
    />,
  );

  act(() => captured.onPieceDrag({ square: "b1" }));

  expect(fillAt("a3").backgroundImage).toContain("radial-gradient");
  expect(fillAt("b1").backgroundColor).toBeDefined();
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
  expect(captured.onPieceDrop({ sourceSquare: "e2", targetSquare: "e4" })).toBe(false);
});

it("never asks about a piece let go outside the board", () => {
  const onMove = vi.fn().mockReturnValue(true);
  render(<Board fen={START} onMove={onMove} />);

  expect(captured.onPieceDrop({ sourceSquare: "e2", targetSquare: null })).toBe(false);
  expect(onMove).not.toHaveBeenCalled();
});

// A badge sits on its square's top-right corner, pushed inward where that
// corner is the board's own edge.
it.each([
  { square: "e4", orientation: "white", edges: { right: false, top: false } },
  { square: "h4", orientation: "white", edges: { right: true, top: false } },
  { square: "e8", orientation: "white", edges: { right: false, top: true } },
  { square: "h8", orientation: "white", edges: { right: true, top: true } },
  { square: "a1", orientation: "white", edges: { right: false, top: false } },
  { square: "a4", orientation: "black", edges: { right: true, top: false } },
  { square: "e1", orientation: "black", edges: { right: false, top: true } },
  { square: "a1", orientation: "black", edges: { right: true, top: true } },
  { square: "h8", orientation: "black", edges: { right: false, top: false } },
] as const)(
  "finds the edges of $square with $orientation at the bottom",
  ({ square, orientation, edges }) => {
    expect(badgeEdgesOf(square, orientation)).toEqual(edges);
  },
);

it("trims the arrowhead and keeps the arrows translucent", () => {
  render(<Board fen={START} bestMove={{ from: "e2", to: "e4" }} />);

  // A quarter off the head clears the destination piece, where the
  // library's default eighth plants it on top of one. The tail stays at the
  // origin's centre, and that overlap reads as "this piece goes there".
  expect(captured.arrowOptions.arrowLengthReducerDenominator).toBe(4);
  expect(captured.arrowOptions.arrowStartOffset).toBe(0);
  // Under the library's 0.65, so an arrow annotates the position rather
  // than becoming an object on it.
  expect(captured.arrowOptions.opacity).toBe(0.45);
});
