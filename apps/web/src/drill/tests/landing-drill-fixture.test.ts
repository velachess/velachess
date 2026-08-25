import { describe, expect, it } from "vitest";

import { playMove } from "../move.ts";
import { landingDrill, landingDrillAnswer } from "../__fixtures__/landing-drill.ts";

describe("landing drill fixture", () => {
  it("replays the presented mistake and accepts the expected alternative", () => {
    expect(playMove(landingDrill.fen, "g2", "g4")?.san).toBe("g4");
    expect(playMove(landingDrill.fen, "e2", "e4")?.san).toBe(
      landingDrillAnswer.expectedSans[0],
    );
  });
});
