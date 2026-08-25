import { describe, expect, it } from "vitest";

import { importPgn } from "@velachess/platforms";
import { FOOLS_MATE_PGN, MULTI_GAME_PGN, ILLEGAL_MOVE_PGN } from "@velachess/fixtures";

describe("importPgn", () => {
  it("normalizes a single pasted game with no provenance and no perspective", () => {
    const result = importPgn(FOOLS_MATE_PGN);
    expect(result.games).toHaveLength(1);
    expect(result.games[0]?.source).toBe("pgn");
    expect(result.games[0]?.externalId).toBeNull();
    expect(result.games[0]?.perspective).toBeNull();
    expect(result.cursor).toBeNull();
    expect(result.complete).toBe(true);
  });

  it("splits and normalizes multiple pasted games", () => {
    const result = importPgn(MULTI_GAME_PGN);
    expect(result.games).toHaveLength(2);
  });

  it("carries an explicit perspective onto every normalized game", () => {
    const result = importPgn(MULTI_GAME_PGN, { perspective: "white" });
    expect(result.games.every((g) => g.perspective === "white")).toBe(true);
  });

  it("normalizeGame still accepts a PGN with an illegal move — legality is not this package's job", () => {
    const result = importPgn(ILLEGAL_MOVE_PGN);
    expect(result.games).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
  });

  it("never sniffs content — always treats input as pgn origin regardless of shape", () => {
    const result = importPgn("garbage input, not a real pgn");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.reason).toBe("parse-error");
  });
});
