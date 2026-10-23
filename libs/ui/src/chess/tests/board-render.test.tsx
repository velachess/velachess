// @vitest-environment jsdom
/**
 * Against the real `react-chessboard`, because the captured `options` prove
 * only what we asked for. That gap hid two bugs: `squareStyles` is read
 * only by the div a `squareRenderer` replaces, so every fill was discarded,
 * and a piece renders inside its square, so wiring both `onPieceClick` and
 * `onSquareClick` made one click report two moves.
 *
 * Dragging stays in `board.test.tsx`: dnd-kit needs a pointer and a layout
 * jsdom lacks.
 */
import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { Board } from "../board.tsx";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
/** exd5 captures onto an occupied square. */
const CAPTURE = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";

const KNIGHT_OPENINGS = [
  { square: "a3", isCapture: false },
  { square: "c3", isCapture: false },
];

const knightTargets = (from: string) => (from === "b1" ? KNIGHT_OPENINGS : []);

/** The library's own per-square id. */
const squareAt = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLElement>(`#chessboard-square-${name}`);

/** The div our `squareRenderer` returns, where every fill lands. */
const fillAt = (container: HTMLElement, name: string) =>
  squareAt(container, name)?.querySelector("div")?.getAttribute("style") ?? "";

const badgeAt = (container: HTMLElement, name: string) =>
  squareAt(container, name)?.querySelector('[data-slot="square-badge"]') ?? null;

/** Throws rather than asserting, so a renamed library id is named instead
 * of a click silently doing nothing. */
const clickOn = (element: HTMLElement | null, what: string) => {
  if (!element) throw new Error(`${what} is not on the board`);
  act(() => {
    element.click();
  });
};

const clickPiece = (container: HTMLElement, id: string) =>
  clickOn(container.querySelector<HTMLElement>(`#chessboard-piece-${id}`), id);

const clickSquare = (container: HTMLElement, name: string) =>
  clickOn(squareAt(container, name), name);

// The first mount is real DOM work over 64 squares, which a throttled CI
// runner has pushed past the default 5s.
const SLOW = 10_000;

it("renders a square for every one of the sixty-four", () => {
  const { container } = render(<Board fen={START} />);

  expect(container.querySelectorAll("[data-square]")).toHaveLength(64);
});

it(
  "lights both squares of the last move",
  () => {
    const { container } = render(<Board fen={START} />);
    expect(fillAt(container, "e2")).toBe("");

    const { container: lit } = render(
      <Board fen={START} lastMove={{ from: "e2", to: "e4" }} />,
    );

    expect(fillAt(lit, "e2")).toContain("--board-highlight");
    expect(fillAt(lit, "e4")).toContain("--board-highlight");
    expect(fillAt(lit, "d2")).toBe("");
  },
  SLOW,
);

it(
  "marks a badge only on the square that has one",
  () => {
    const { container } = render(<Board fen={START} badges={{ e4: "blunder" }} />);

    expect(badgeAt(container, "e4")).not.toBeNull();
    expect(badgeAt(container, "d4")).toBeNull();
  },
  SLOW,
);

it(
  "paints a legal destination once a piece is picked up",
  () => {
    const { container } = render(
      <Board fen={START} legalTargetsOf={() => KNIGHT_OPENINGS} />,
    );

    expect(fillAt(container, "a3")).not.toContain("radial-gradient");

    clickPiece(container, "wN-b1");

    expect(fillAt(container, "a3")).toContain("radial-gradient");
    expect(fillAt(container, "c3")).toContain("radial-gradient");
  },
  SLOW,
);

it(
  "marks the square the piece came from",
  () => {
    const { container } = render(
      <Board fen={START} legalTargetsOf={() => KNIGHT_OPENINGS} />,
    );

    clickPiece(container, "wN-b1");

    expect(fillAt(container, "b1")).toContain("background-color");
  },
  SLOW,
);

it(
  "tells a capture apart from a quiet move",
  () => {
    const { container } = render(
      <Board
        fen={CAPTURE}
        legalTargetsOf={() => [
          { square: "d5", isCapture: true },
          { square: "e5", isCapture: false },
        ]}
      />,
    );

    clickPiece(container, "wP-e4");

    const capture = fillAt(container, "d5");
    const quiet = fillAt(container, "e5");
    expect(capture).toContain("radial-gradient");
    expect(quiet).toContain("radial-gradient");
    expect(capture).not.toBe(quiet);
  },
  SLOW,
);

it(
  "leaves a board with no hint source unmarked",
  () => {
    // A replay board is read, not played, so marks on it are noise.
    const { container } = render(<Board fen={START} />);

    clickPiece(container, "wN-b1");

    expect(fillAt(container, "b1")).toBe("");
    expect(fillAt(container, "a3")).not.toContain("radial-gradient");
  },
  SLOW,
);

it(
  "makes exactly one move attempt per click-to-capture gesture",
  () => {
    // A piece renders inside its square and neither handler stops
    // propagation, so one click on an occupied destination reaches both.
    const onMove = vi.fn(() => true);
    const { container } = render(
      <Board
        fen={CAPTURE}
        onMove={onMove}
        legalTargetsOf={(from) =>
          from === "e4" ? [{ square: "d5", isCapture: true }] : []
        }
      />,
    );

    clickPiece(container, "wP-e4");
    clickPiece(container, "bP-d5");

    expect(onMove.mock.calls).toEqual([[{ from: "e4", to: "d5" }]]);
  },
  SLOW,
);

it(
  "plays the move when a legal destination is clicked, and clears the marks",
  () => {
    const onMove = vi.fn(() => true);
    const { container } = render(
      <Board fen={START} onMove={onMove} legalTargetsOf={knightTargets} />,
    );

    clickPiece(container, "wN-b1");
    clickSquare(container, "a3");

    expect(onMove.mock.calls).toEqual([[{ from: "b1", to: "a3" }]]);
    expect(fillAt(container, "c3")).not.toContain("radial-gradient");
    expect(fillAt(container, "b1")).toBe("");
  },
  SLOW,
);

it(
  "re-selects instead of moving when another piece is clicked",
  () => {
    const onMove = vi.fn(() => true);
    const { container } = render(
      <Board
        fen={START}
        onMove={onMove}
        legalTargetsOf={(from) =>
          from === "b1" ? KNIGHT_OPENINGS : [{ square: "f3", isCapture: false }]
        }
      />,
    );

    clickPiece(container, "wN-b1");
    clickPiece(container, "wN-g1");

    expect(onMove).not.toHaveBeenCalled();
    expect(fillAt(container, "f3")).toContain("radial-gradient");
    expect(fillAt(container, "a3")).not.toContain("radial-gradient");
  },
  SLOW,
);

it(
  "clears the selection when an unreachable empty square is clicked",
  () => {
    const onMove = vi.fn(() => true);
    const { container } = render(
      <Board fen={START} onMove={onMove} legalTargetsOf={() => KNIGHT_OPENINGS} />,
    );

    clickPiece(container, "wN-b1");
    clickSquare(container, "h5");

    expect(onMove).not.toHaveBeenCalled();
    expect(fillAt(container, "a3")).not.toContain("radial-gradient");
  },
  SLOW,
);

it(
  "drops the selection when the position changes under it",
  () => {
    // Stepping must not leave dots on a square nobody picked up there.
    // `animated={false}` as the review screen runs it, the library
    // measuring a square jsdom never lays out.
    const { container, rerender } = render(
      <Board fen={START} animated={false} legalTargetsOf={knightTargets} />,
    );

    clickPiece(container, "wN-b1");
    expect(fillAt(container, "a3")).toContain("radial-gradient");

    rerender(<Board fen={AFTER_E4} animated={false} legalTargetsOf={knightTargets} />);

    expect(fillAt(container, "a3")).not.toContain("radial-gradient");
    expect(fillAt(container, "b1")).toBe("");
  },
  SLOW,
);
