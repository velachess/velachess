// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { BADGE_CORNERS, BADGE_TONES } from "../board-theme.ts";
import { SquareBadge } from "../square-badge.tsx";

// Font rendering decides a text glyph's stroke weight, so the mark is an
// SVG with one stroke width instead.
it.each(BADGE_TONES)("draws the %s mark as an SVG, not as text", (tone) => {
  const { container } = render(<SquareBadge tone={tone} corner="top-right" />);

  expect(container.querySelector("svg")).not.toBeNull();
  expect(container.textContent).toBe("");
});

it("gives every tone a mark of its own", () => {
  const marks = BADGE_TONES.map((tone) => {
    const { container, unmount } = render(<SquareBadge tone={tone} corner="top-right" />);
    const mark = container.querySelector("svg")?.innerHTML;
    unmount();
    return mark;
  });

  expect(new Set(marks).size).toBe(BADGE_TONES.length);
});

it.each(BADGE_CORNERS)("anchors itself to the %s corner", (corner) => {
  const { container } = render(<SquareBadge tone="blunder" corner={corner} />);

  // The badge straddles the corner, so each one needs its own pair of
  // edge offsets and its own translate — a single class cannot serve two.
  const className = container.firstElementChild!.className;
  const [vertical, horizontal] = corner.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];
  expect(className).toContain(`${vertical}-0`);
  expect(className).toContain(`${horizontal}-0`);
});
