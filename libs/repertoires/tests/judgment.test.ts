import { describe, expect, it } from "vitest";

import { judgmentType } from "../judgment.ts";

describe("judgmentType", () => {
  it("names all four outcomes", () => {
    // judgmentType only ever reads `event?.type` (see its own doc
    // comment) — no need for a real DeviationResult from a replayed
    // game, which used to come from the old package's judgeAgainstChapters
    // before dispatch.ts/deviation.ts moved to games/judge-games.
    expect(judgmentType({ event: null })).toBe("completed");
    expect(judgmentType({ event: { type: "deviation" } })).toBe("deviation");
    expect(judgmentType({ event: { type: "gap" } })).toBe("gap");
    expect(judgmentType({ event: { type: "book-ended" } })).toBe("book-ended");
  });
});
