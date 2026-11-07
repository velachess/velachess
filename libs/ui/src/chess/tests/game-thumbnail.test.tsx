// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { GameThumbnail } from "../game-thumbnail.tsx";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

const piece = (container: HTMLElement, square: string) =>
  container.querySelector(`[data-square="${square}"]`);

it("draws every piece of the position it is given", () => {
  const { container } = render(<GameThumbnail fen={START} />);

  expect(container.querySelectorAll("[data-piece]")).toHaveLength(32);
  expect(piece(container, "e1")?.getAttribute("data-piece")).toBe("wK");
  expect(piece(container, "d8")?.getAttribute("data-piece")).toBe("bQ");
});

it("moves a piece to where the position has it", () => {
  const { container } = render(<GameThumbnail fen={AFTER_E4} />);

  expect(piece(container, "e2")).toBeNull();
  expect(piece(container, "e4")?.getAttribute("data-piece")).toBe("wP");
});

it("seats white at the bottom unless told otherwise", () => {
  const { container } = render(<GameThumbnail fen={START} />);
  const rook = piece(container, "a1");

  expect([rook?.getAttribute("x"), rook?.getAttribute("y")]).toEqual(["0", "7"]);
});

it("seats black at the bottom from black's perspective", () => {
  const { container } = render(<GameThumbnail fen={START} orientation="black" />);
  const rook = piece(container, "a1");

  expect([rook?.getAttribute("x"), rook?.getAttribute("y")]).toEqual(["7", "0"]);
});

it("paints the board from the theme tokens", () => {
  const { container } = render(<GameThumbnail fen={START} />);
  const fills = [
    ...(container.firstElementChild?.querySelectorAll(":scope > rect, :scope > path") ??
      []),
  ].map((shape) => shape.getAttribute("fill"));

  expect(fills).toEqual(["var(--board-dark)", "var(--board-light)"]);
});

it("is read-only: hidden from assistive tech, no notation, no pointer events", () => {
  const { container } = render(<GameThumbnail fen={START} />);
  const root = container.firstElementChild;

  expect(root?.getAttribute("aria-hidden")).toBe("true");
  expect(root?.getAttribute("class")).toContain("pointer-events-none");
  expect(container.textContent).toBe("");
});

it("still renders the frame for a position it cannot read", () => {
  const { container } = render(<GameThumbnail fen="" />);

  expect(container.querySelector("[data-slot=game-thumbnail]")).not.toBeNull();
  expect(container.querySelectorAll("[data-piece]")).toHaveLength(0);
});
