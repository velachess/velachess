// @vitest-environment jsdom
/**
 * The board against the real `react-chessboard`, not a mock of it.
 *
 * `board.test.tsx` captures the `options` object and asserts on that,
 * which proves we ask for the right thing and nothing about whether the
 * library does it. It missed a whole feature: `squareStyles` is read only
 * by the library's own square div, and a `squareRenderer` replaces that
 * div outright — so every hint we computed was discarded, and every
 * assertion still passed.
 *
 * One unmocked test is the guard against that class of bug.
 */
import { act, render } from "@testing-library/react";
import { expect, it } from "vitest";

import { Board } from "../board.tsx";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const KNIGHT_OPENINGS = [
  { square: "a3", isCapture: false },
  { square: "c3", isCapture: false },
];

/** The library renders `id="chessboard-square-<name>"` per square. */
const squareAt = (container: HTMLElement, name: string) =>
  container.querySelector(`#chessboard-square-${name}`);

it("paints a legal destination once a piece is picked up", () => {
  const { container } = render(
    <Board fen={START} legalTargetsOf={() => KNIGHT_OPENINGS} />,
  );

  const before = squareAt(container, "a3");
  expect(before?.innerHTML).not.toContain("radial-gradient");

  const knight = container.querySelector("#chessboard-piece-wN-b1");
  act(() => {
    (knight as HTMLElement | null)?.click();
  });

  // The mark lands on the child this component renders, because that is
  // where a squareRenderer puts it.
  expect(squareAt(container, "a3")?.innerHTML).toContain("radial-gradient");
});

it("renders a square for every one of the sixty-four", () => {
  // Cheap smoke test that the library mounted at all: without it a
  // silently broken render would make the assertion above pass by
  // finding nothing twice.
  const { container } = render(<Board fen={START} />);

  expect(container.querySelectorAll("[data-square]")).toHaveLength(64);
});
