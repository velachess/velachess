import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { VelaChessMark } from "../mark.tsx";

function numberOf(element: Element | null, attribute: string): number {
  return Number(element?.getAttribute(attribute));
}

it("frames the micro pawn on its own centre", () => {
  const { container } = render(<VelaChessMark size="micro" />);
  const svg = container.querySelector("svg");
  const head = container.querySelector("circle");
  const base = container.querySelector("rect");

  const [minX = 0, minY = 0, width = 0, height = 0] = (svg?.getAttribute("viewBox") ?? "")
    .split(" ")
    .map(Number);
  const pawnLeft = numberOf(base, "x");
  const pawnRight = pawnLeft + numberOf(base, "width");
  const pawnTop = numberOf(head, "cy") - numberOf(head, "r");
  const pawnBottom = numberOf(base, "y") + numberOf(base, "height");

  expect(minX + width / 2).toBeCloseTo((pawnLeft + pawnRight) / 2, 0);
  expect(minY + height / 2).toBeCloseTo((pawnTop + pawnBottom) / 2, 0);
});
