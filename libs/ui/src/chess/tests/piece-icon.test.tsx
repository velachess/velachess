// @vitest-environment jsdom
/**
 * The piece a move moved, read off its own notation. The rendering is
 * `react-chessboard`'s SVG and is not re-asserted here — what is worth
 * pinning is the reading of SAN, which is ours and is easy to get subtly
 * wrong.
 */
import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { PieceIcon, pieceKindOf } from "../piece-icon.tsx";

it("reads the piece letter off the notation", () => {
  expect(pieceKindOf("Nf3")).toBe("N");
  expect(pieceKindOf("Qxd5")).toBe("Q");
  expect(pieceKindOf("Rae1")).toBe("R");
  expect(pieceKindOf("Bb5+")).toBe("B");
  expect(pieceKindOf("Kd2")).toBe("K");
});

it("treats a move that names no piece as a pawn", () => {
  // SAN says nothing for a pawn, which is why the fallback is not an error.
  expect(pieceKindOf("e4")).toBe("P");
  expect(pieceKindOf("exd5")).toBe("P");
  expect(pieceKindOf("e8=Q")).toBe("P");
});

it("shows the king for castling, which names no piece and moves two", () => {
  expect(pieceKindOf("O-O")).toBe("K");
  expect(pieceKindOf("O-O-O")).toBe("K");
  // The suffix must not turn it into something else.
  expect(pieceKindOf("O-O+")).toBe("K");
});

it("draws an svg rather than a font glyph", () => {
  // The whole point: a Unicode glyph renders in whatever chess font the
  // reader happens to have, and came out hairline on one screen and solid
  // on another.
  const { container } = render(<PieceIcon kind="N" side="white" />);
  expect(container.querySelector("svg")).not.toBeNull();
});

it("is decorative — the notation beside it already says the piece", () => {
  const { container } = render(<PieceIcon kind="Q" side="black" />);
  expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
});
