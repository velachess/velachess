import { describe, expect, it } from "vitest";

import { splitPgnGames } from "@velachess/platforms";
import { FOOLS_MATE_PGN, MULTI_GAME_PGN, LICHESS_PGN_EXPORT } from "@velachess/fixtures";

describe("splitPgnGames", () => {
  it("returns one chunk for a single game", () => {
    expect(splitPgnGames(FOOLS_MATE_PGN)).toHaveLength(1);
  });

  it("splits a blob into one chunk per game", () => {
    const chunks = splitPgnGames(MULTI_GAME_PGN);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('[Event "Fool\'s Mate"]');
    expect(chunks[1]).toContain('[Event "Unfinished"]');
  });

  it("splits real Lichess export text the same way", () => {
    const chunks = splitPgnGames(LICHESS_PGN_EXPORT);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain('[GameId "TJxUmbWK"]');
    expect(chunks[1]).toContain('[GameId "aB3dEfGh"]');
  });

  it("returns an empty array for empty/whitespace-only input", () => {
    expect(splitPgnGames("")).toEqual([]);
    expect(splitPgnGames("   \n\n  ")).toEqual([]);
  });

  it("trims leading/trailing whitespace per chunk", () => {
    const chunks = splitPgnGames(MULTI_GAME_PGN);
    for (const chunk of chunks) {
      expect(chunk).toBe(chunk.trim());
    }
  });
});
