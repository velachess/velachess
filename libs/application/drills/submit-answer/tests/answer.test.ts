import { describe, expect, it } from "vitest";

import { checkAnswer, gradeResponse } from "../answer.ts";
import {
  eligibleForDrill,
  type EligibilityInput,
} from "../../seed-exercises/eligibility.ts";
import { seedFromDeviation } from "../../seed-exercises/exercise.ts";

describe("eligibleForDrill", () => {
  const base: EligibilityInput = { type: "deviation", expectedSans: ["d4"] };

  it("passes only the deviation type", () => {
    expect(eligibleForDrill(base)).toBe(true);
    for (const type of ["completed", "gap", "book-ended"] as const) {
      expect(eligibleForDrill({ ...base, type }), type).toBe(false);
    }
  });

  it("requires a prepared answer", () => {
    expect(eligibleForDrill({ ...base, expectedSans: null })).toBe(false);
    expect(eligibleForDrill({ ...base, expectedSans: [] })).toBe(false);
  });

  it("drills a departure the engine was happy with", () => {
    // The reason this origin exists. Playing a sound move that is not your
    // move costs nothing on the evaluation, so the engine origin will never
    // raise it — and forgetting your preparation is the failure repertoire
    // drilling is for. Gating this on engine severity made the repertoire
    // origin a subset of the engine one.
    expect(eligibleForDrill(base)).toBe(true);
  });

  it("does not wait for analysis", () => {
    // Judging is enough. Requiring a graded report first meant a deviation
    // sat undrillable until an unrelated job finished, and forever if the
    // game had already been analyzed before the repertoire existed.
    expect(eligibleForDrill({ type: "deviation", expectedSans: ["Nf3"] })).toBe(true);
  });
});

describe("seedFromDeviation", () => {
  it("builds a seed from a complete deviation", () => {
    expect(
      seedFromDeviation({ id: "d1", positionKey: "k", expectedSans: ["d4", "Nf3"] }),
    ).toEqual({
      positionKey: "k",
      expectedSans: ["d4", "Nf3"],
      origin: { kind: "repertoire-deviation", deviationId: "d1" },
    });
  });

  it("returns null when required fields are missing", () => {
    expect(
      seedFromDeviation({ id: "d1", positionKey: null, expectedSans: ["d4"] }),
    ).toBeNull();
    expect(
      seedFromDeviation({ id: "d1", positionKey: "k", expectedSans: null }),
    ).toBeNull();
    expect(
      seedFromDeviation({ id: "d1", positionKey: "k", expectedSans: [] }),
    ).toBeNull();
  });
});

describe("checkAnswer", () => {
  const exercise = { expectedSans: ["d4", "Nf3"] };

  it("accepts any prepared answer and rejects the rest", () => {
    expect(checkAnswer(exercise, "d4")).toBe(true);
    expect(checkAnswer(exercise, "Nf3")).toBe(true);
    expect(checkAnswer(exercise, "Bc4")).toBe(false);
  });

  it("compares SAN strictly", () => {
    expect(checkAnswer({ expectedSans: ["Ngf3"] }, "Nf3")).toBe(false);
  });
});

describe("gradeResponse", () => {
  it("maps correctness to good/again", () => {
    expect(gradeResponse({ correct: true })).toBe("good");
    expect(gradeResponse({ correct: false })).toBe("again");
  });

  it("ignores response time in the current mapping", () => {
    expect(gradeResponse({ correct: true, responseTimeMs: 200 })).toBe("good");
    expect(gradeResponse({ correct: false, responseTimeMs: 60_000 })).toBe("again");
  });
});
