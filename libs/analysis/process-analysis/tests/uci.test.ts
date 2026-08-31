import { describe, expect, it } from "vitest";

import { uciOf } from "../uci.ts";

describe("uciOf", () => {
  it("renders normal moves, promotions (knight is n), and drops", () => {
    expect(uciOf({ from: 12, to: 28 })).toBe("e2e4");
    expect(uciOf({ from: 52, to: 60, promotion: "queen" })).toBe("e7e8q");
    expect(uciOf({ from: 52, to: 60, promotion: "knight" })).toBe("e7e8n");
    expect(uciOf({ role: "knight", to: 28 })).toBe("N@e4");
  });
});
