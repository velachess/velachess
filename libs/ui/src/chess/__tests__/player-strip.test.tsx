// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { countryNameOf } from "../country-names.ts";
import { PlayerStrip, flagClassOf, initialsOf } from "../player-strip.tsx";

it("takes one letter per word when a name has parts", () => {
  expect(initialsOf("Yuri Mutti")).toBe("YM");
  // Three words still yields two letters, not three.
  expect(initialsOf("Jose da Silva")).toBe("JD");
  expect(initialsOf("  spaced   out  ")).toBe("SO");
});

it("opens a single word, which is what most usernames are", () => {
  expect(initialsOf("kalipere")).toBe("KA");
  expect(initialsOf("x")).toBe("X");
});

it("counts characters the way a reader does, not the way UTF-16 does", () => {
  // `"🐴rider".slice(0, 2)` splits the surrogate pair and renders as a
  // replacement character. Chess usernames carry emoji often enough.
  expect(initialsOf("🐴rider")).toBe("🐴R");
  expect(initialsOf("🐴 rider")).toBe("🐴R");
});

it("has nothing to show for a name that is only whitespace", () => {
  expect(initialsOf("")).toBe("");
  expect(initialsOf("   ")).toBe("");
});

it("lands an unrecognised country on the blank flag", () => {
  // `flag-icons` ships `xx` precisely so a bad code renders empty rather
  // than as a box with a missing background.
  expect(flagClassOf("BR")).toBe("fi fi-br");
  expect(flagClassOf("br")).toBe("fi fi-br");
  expect(flagClassOf("BRA")).toBe("fi fi-xx");
  expect(flagClassOf("")).toBe("fi fi-xx");
  expect(flagClassOf(undefined)).toBe("fi fi-xx");
});

it("shows the rating as an aside, not as part of the name", () => {
  render(<PlayerStrip name="kalipere" rating="142" />);

  expect(screen.getByText("kalipere")).toBeDefined();
  expect(screen.getByText("(142)")).toBeDefined();
});

it("says nothing about a rating the platform did not report", () => {
  render(<PlayerStrip name="kalipere" />);
  expect(screen.queryByText(/\(/)).toBeNull();
});

it("names the flag from the code, so the two cannot drift apart", () => {
  const { unmount } = render(<PlayerStrip name="kalipere" countryCode="BR" />);
  expect(screen.getByRole("img", { name: "Brazil" })).toBeDefined();
  unmount();

  // An unknown code gets no name, and an unnamed flag is decoration — it
  // must not be announced as an unlabelled image.
  render(<PlayerStrip name="kalipere" countryCode="zz" />);
  expect(screen.queryByRole("img")).toBeNull();
});

it("resolves a country name without caring about case", () => {
  expect(countryNameOf("BR")).toBe("Brazil");
  expect(countryNameOf("br")).toBe("Brazil");
  expect(countryNameOf("zz")).toBeUndefined();
  expect(countryNameOf(undefined)).toBeUndefined();
});

it("falls back to initials when there is no photo", () => {
  render(<PlayerStrip name="Yuri Mutti" />);
  expect(screen.getByText("YM")).toBeDefined();
});
