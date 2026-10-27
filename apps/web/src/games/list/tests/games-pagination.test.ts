import { describe, expect, it } from "vitest";

import { lastPageOf, pageSlots } from "../games-pagination.tsx";
import { PAGE_SIZE } from "../filters.ts";

describe("how many pages there are", () => {
  it("counts the partial last page", () => {
    expect(lastPageOf(PAGE_SIZE + 1)).toBe(2);
    expect(lastPageOf(PAGE_SIZE)).toBe(1);
  });

  it("keeps one page when there is nothing to show", () => {
    // A pager offering page 0 of 0 has nowhere to send anyone.
    expect(lastPageOf(0)).toBe(1);
  });
});

describe("which pages get a button", () => {
  it("shows every page while they all fit", () => {
    expect(pageSlots(1, 3)).toEqual([1, 2, 3]);
  });

  it("keeps both ends reachable from the middle", () => {
    expect(pageSlots(10, 19)).toEqual([1, "gap", 9, 10, 11, "gap", 19]);
  });

  it("holds the window inside the archive at either end", () => {
    // Clamped rather than counting past the last page or below the first.
    expect(pageSlots(1, 19)).toEqual([1, 2, 3, "gap", 19]);
    expect(pageSlots(19, 19)).toEqual([1, "gap", 17, 18, 19]);
  });

  it("never repeats a page", () => {
    expect(pageSlots(1, 1)).toEqual([1]);
    expect(pageSlots(2, 4)).toEqual([1, 2, 3, 4]);
  });
});
