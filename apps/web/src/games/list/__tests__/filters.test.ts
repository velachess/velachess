import { describe, expect, it } from "vitest";

import { activeFilterCount, FILTER_GROUPS, gamesSearchSchema } from "../filters.ts";

describe("filters in the URL", () => {
  it("defaults to the first page with nothing narrowed", () => {
    expect(gamesSearchSchema.parse({})).toEqual({ page: 1 });
  });

  it("keeps what it recognises", () => {
    expect(gamesSearchSchema.parse({ color: "black", outcome: "loss", page: 3 })).toEqual(
      {
        color: "black",
        outcome: "loss",
        page: 3,
      },
    );
  });

  it("falls back instead of crashing the route on a hand-typed URL", () => {
    // validateSearch runs before the component exists, so a throw here
    // would blank the screen rather than show an unfiltered list.
    expect(gamesSearchSchema.parse({ outcome: "banana", color: "green" })).toEqual({
      page: 1,
    });
    expect(gamesSearchSchema.parse({ page: -3 })).toEqual({ page: 1 });
    expect(gamesSearchSchema.parse({ page: 1.5 })).toEqual({ page: 1 });
  });

  it("counts what narrows the list, and not the page", () => {
    expect(activeFilterCount({ page: 4 })).toBe(0);
    expect(activeFilterCount({ page: 1, color: "white" })).toBe(1);
    expect(
      activeFilterCount({ page: 1, color: "white", outcome: "win", timeClass: "blitz" }),
    ).toBe(3);
  });
});

describe("the filter catalogue", () => {
  it("offers only values the schema accepts, so no control can be dead", () => {
    for (const group of FILTER_GROUPS) {
      for (const option of group.options) {
        const parsed = gamesSearchSchema.parse({ [group.key]: option.value });
        expect(parsed[group.key], `${group.key}=${option.value}`).toBe(option.value);
      }
    }
  });
});
