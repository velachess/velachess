import { parsePgn, replayMainline } from "@velachess/chess";
import { describe, expect, it } from "vitest";

import { LANDING_GAME_PGN, landingAnalysis } from "./fixtures/landing-game-analysis.ts";

describe("landing game analysis fixture", () => {
  it("grades every legal move from its actual position", () => {
    const [game] = parsePgn(LANDING_GAME_PGN);
    expect(game).toBeDefined();

    const replay = replayMainline(game!).unwrap();

    expect(replay.moves.map((move) => move.san)).toEqual(
      landingAnalysis.map((position) => position.san),
    );
    expect(replay.moves.map((move) => move.fenBefore)).toEqual(
      landingAnalysis.map((position) => position.fen),
    );
    expect(replay.moves.at(-1)?.san).toBe("Qh4#");
  });
});
