/**
 * The time-class rule, as its own unit. Every expectation is written out
 * rather than computed from the rule under test — a single-sourced rule
 * must not also single-source its own expectation. The same boundaries
 * are pinned over HTTP in `apps/server/tests/library-filters.test.ts`,
 * which is what keeps the SQL predicate and this function in agreement.
 */
import { describe, expect, it } from "vitest";

import { ESTIMATED_MOVES, TIME_CLASSES, timeClassOf } from "@velachess/chess";

describe("time class", () => {
  it("names the four classes, in ascending duration", () => {
    expect(TIME_CLASSES).toEqual(["bullet", "blitz", "rapid", "classical"]);
  });

  it("estimates duration as the clock plus forty increments", () => {
    expect(ESTIMATED_MOVES).toBe(40);
    // 60 + 40 x 3 is 180, the bullet ceiling; one increment less is not.
    expect(timeClassOf(60, 3)).toBe("blitz");
    expect(timeClassOf(60, 2)).toBe("bullet");
  });

  it("buckets by estimated duration", () => {
    expect(timeClassOf(60, 0)).toBe("bullet");
    expect(timeClassOf(300, 0)).toBe("blitz");
    expect(timeClassOf(600, 0)).toBe("rapid");
    expect(timeClassOf(1800, 0)).toBe("classical");
  });

  it("treats each boundary as the next class's floor", () => {
    expect(timeClassOf(179, 0)).toBe("bullet");
    expect(timeClassOf(180, 0)).toBe("blitz");
    expect(timeClassOf(479, 0)).toBe("blitz");
    expect(timeClassOf(480, 0)).toBe("rapid");
    expect(timeClassOf(1499, 0)).toBe("rapid");
    expect(timeClassOf(1500, 0)).toBe("classical");
  });

  it("counts the increment: 1+3 is blitz where 1+0 is bullet", () => {
    expect(timeClassOf(60, 0)).toBe("bullet");
    expect(timeClassOf(60, 3)).toBe("blitz");
  });

  it("reads a missing increment as zero", () => {
    expect(timeClassOf(60, null)).toBe("bullet");
    expect(timeClassOf(60, undefined)).toBe("bullet");
  });

  it("answers null when there was no clock, rather than guessing", () => {
    expect(timeClassOf(null, null)).toBeNull();
    expect(timeClassOf(undefined, 2)).toBeNull();
  });
});
