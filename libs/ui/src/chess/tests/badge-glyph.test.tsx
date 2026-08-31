// @vitest-environment jsdom
/**
 * The board's move-grade mark: an SVG, not a Unicode glyph — same fix
 * `piece-icon.test.tsx` pins for pieces, and for the same reason (a
 * Unicode glyph's stroke weight is decided by the reader's platform font).
 */
import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { BadgeGlyph } from "../badge-glyph.tsx";

it("draws the best-move mark as an svg, not a font glyph", () => {
  const { container } = render(<BadgeGlyph kind="best" />);
  expect(container.querySelector("svg")).not.toBeNull();
});

it("draws a NAG mark as an svg carrying its own text", () => {
  const { container } = render(<BadgeGlyph kind="nag" nag="??" />);
  const svg = container.querySelector("svg");
  expect(svg).not.toBeNull();
  expect(svg?.textContent).toBe("??");
});

it("is decorative — the badge's tone already carries the meaning", () => {
  const { container } = render(<BadgeGlyph kind="best" />);
  expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
});
