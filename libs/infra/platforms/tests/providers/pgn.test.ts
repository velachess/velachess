import { describe, expect, it } from "vitest";

import {
  FOOLS_MATE_PGN,
  ILLEGAL_MOVE_PGN,
  IMPORTED_PLAYER_NAME,
  MIXED_COLOR_PGN,
  MULTI_GAME_PGN,
} from "@velachess/fixtures";
import { importPgn } from "@velachess/infra-platforms";

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

  it("resolves the named player's seat in each game of a mixed-color file", () => {
    const result = importPgn(MIXED_COLOR_PGN, { playerName: IMPORTED_PLAYER_NAME });
    expect(result.games.map((game) => game.perspective)).toEqual(["white", "black"]);
  });

  it("matches the player's name case-insensitively", () => {
    const result = importPgn(MIXED_COLOR_PGN, {
      playerName: IMPORTED_PLAYER_NAME.toLowerCase(),
    });
    expect(result.games.map((game) => game.perspective)).toEqual(["white", "black"]);
  });

  it("leaves games without the named player unattributed instead of guessing", () => {
    const result = importPgn(MIXED_COLOR_PGN, { playerName: "Someone Else" });
    expect(result.games.every((game) => game.perspective === null)).toBe(true);
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
