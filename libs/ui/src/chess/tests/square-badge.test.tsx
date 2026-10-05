// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { BADGE_TONES } from "../board-theme.ts";
import { SquareBadge } from "../square-badge.tsx";
import type { BadgeEdges } from "../square-badge.tsx";

const INTERIOR: BadgeEdges = { right: false, top: false };

// Font rendering decides a text glyph's stroke weight, so the mark is an
// SVG with one stroke width instead.
it.each(BADGE_TONES)("draws the %s mark as an SVG, not as text", (tone) => {
  const { container } = render(<SquareBadge tone={tone} edges={INTERIOR} />);

  expect(container.querySelector("svg")).not.toBeNull();
  expect(container.textContent).toBe("");
});

it("gives every tone a mark of its own", () => {
  const marks = BADGE_TONES.map((tone) => {
    const { container, unmount } = render(<SquareBadge tone={tone} edges={INTERIOR} />);
    const mark = container.querySelector("svg")?.innerHTML;
    unmount();
    return mark;
  });

  expect(new Set(marks).size).toBe(BADGE_TONES.length);
});
