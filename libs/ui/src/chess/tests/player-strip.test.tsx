// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { PlayerStrip } from "../player-strip.tsx";

it("shows the rating as an aside, not as part of the name", () => {
  render(<PlayerStrip name="kalipere" rating="142" />);

  expect(screen.getByText("kalipere")).toBeDefined();
  expect(screen.getByText("(142)")).toBeDefined();
});

it("says nothing about a rating the platform did not report", () => {
  render(<PlayerStrip name="kalipere" />);
  expect(screen.queryByText(/\(/)).toBeNull();
});

it("shows a rating of zero, which is a rating", () => {
  render(<PlayerStrip name="kalipere" rating="0" />);
  expect(screen.getByText("(0)")).toBeDefined();
});

it("draws the seat as its name alone, with no picture of any kind", () => {
  const { container } = render(<PlayerStrip name="Yuri Mutti" rating="1500" />);

  expect(container.querySelector("img")).toBeNull();
  expect(screen.queryByText("YM")).toBeNull();
});
