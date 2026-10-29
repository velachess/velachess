import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  CHOICE_GROUPS,
  gamesSearchSchema,
  isNarrowed,
  SOURCE_OPTIONS,
} from "../filters.ts";

describe("filters in the URL", () => {
  it("defaults to the first page with nothing narrowed", () => {
    expect(gamesSearchSchema.parse({})).toEqual({ page: 1 });
  });

  it("keeps what it recognises", () => {
    expect(
      gamesSearchSchema.parse({
        opponent: "magnus",
        color: "black",
        outcome: "loss",
        timeClass: ["blitz", "rapid"],
        source: "lichess",
        page: 3,
      }),
    ).toEqual({
      opponent: "magnus",
      color: "black",
      outcome: "loss",
      timeClass: ["blitz", "rapid"],
      source: "lichess",
      page: 3,
    });
  });

  it("falls back instead of crashing the route on a hand-typed URL", () => {
    // validateSearch runs before the component exists, so a throw here
    // would blank the screen rather than show an unfiltered list.
    expect(gamesSearchSchema.parse({ outcome: "banana", color: "green" })).toEqual({
      page: 1,
    });
    expect(gamesSearchSchema.parse({ timeClass: ["blitz", "banana"] })).toEqual({
      page: 1,
    });
    expect(gamesSearchSchema.parse({ timeClass: [] })).toEqual({ page: 1 });
    expect(gamesSearchSchema.parse({ source: "chessdotcom" })).toEqual({ page: 1 });
    expect(gamesSearchSchema.parse({ opponent: "   " })).toEqual({ page: 1 });
    expect(gamesSearchSchema.parse({ page: -3 })).toEqual({ page: 1 });
    expect(gamesSearchSchema.parse({ page: 1.5 })).toEqual({ page: 1 });
  });

  it("counts what the popover holds, and not the page or the search beside it", () => {
    expect(activeFilterCount({ page: 4 })).toBe(0);
    expect(activeFilterCount({ page: 1, opponent: "magnus" })).toBe(0);
    expect(activeFilterCount({ page: 1, color: "white" })).toBe(1);
    // Several classes are one rule, not four.
    expect(activeFilterCount({ page: 1, timeClass: ["blitz", "rapid"] })).toBe(1);
    expect(
      activeFilterCount({
        page: 1,
        color: "white",
        outcome: "win",
        timeClass: ["blitz"],
        source: "pgn",
      }),
    ).toBe(4);
  });

  it("calls a search a narrowing, so a short list is not read as an empty library", () => {
    expect(isNarrowed({ page: 1 })).toBe(false);
    expect(isNarrowed({ page: 1, opponent: "magnus" })).toBe(true);
    expect(isNarrowed({ page: 1, source: "pgn" })).toBe(true);
  });
});

describe("the filter catalogue", () => {
  it("offers only values the schema accepts, so no control can be dead", () => {
    for (const group of CHOICE_GROUPS) {
      for (const option of group.options) {
        const parsed = gamesSearchSchema.parse({ [group.key]: option.value });
        expect(parsed[group.key], `${group.key}=${option.value}`).toBe(option.value);
      }
    }

    for (const option of SOURCE_OPTIONS) {
      expect(gamesSearchSchema.parse({ source: option.value }).source).toBe(option.value);
    }
  });
});
