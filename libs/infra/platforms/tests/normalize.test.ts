import { describe, expect, it } from "vitest";

import { isSyncFailure, normalizeGame } from "@velachess/platforms";
import {
  CHESS_COM_ARCHIVE_MONTH,
  FOOLS_MATE_PGN,
  LICHESS_GAME_PGN,
} from "@velachess/fixtures";

describe("normalizeGame — real Chess.com sample", () => {
  const game = CHESS_COM_ARCHIVE_MONTH.games[0];
  if (!game?.pgn) throw new Error("fixture missing pgn");

  const result = normalizeGame(game.pgn, {
    origin: "chess_com",
    externalId: "100000001",
    externalUrl: game.url,
  });

  it("extracts players and ratings", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.white).toEqual({ name: "test-player", rating: 1500 });
    expect(result.black).toEqual({ name: "test-rival", rating: 1480 });
  });

  it("extracts result, time control, and termination", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.result).toBe("1-0");
    expect(result.timeControl).toEqual({
      initialSeconds: 180,
      incrementSeconds: 0,
      raw: "180",
    });
    expect(result.termination).toBe("test-player won by resignation");
  });

  it("detects clocks despite Chess.com's no-space [%clk] formatting", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.hasClocks).toBe(true);
  });

  it("has no opening name — Chess.com's PGN carries only ECO/ECOUrl, not a name", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.opening.eco).toBe("B23");
    expect(result.opening.name).toBeUndefined();
    expect(result.opening.url).toContain("chess.com/openings");
  });

  it("carries source/provenance through untouched", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.source).toBe("chess_com");
    expect(result.externalId).toBe("100000001");
    expect(result.perspective).toBeNull();
  });
});

describe("normalizeGame — real Lichess sample", () => {
  const result = normalizeGame(LICHESS_GAME_PGN, {
    origin: "lichess",
    externalId: "TJxUmbWK",
    externalUrl: "https://lichess.org/TJxUmbWK",
  });

  it("extracts players and ratings", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.white).toEqual({ name: "arex", rating: 1627 });
    expect(result.black).toEqual({ name: "JERC-12Jesus", rating: 1740 });
  });

  it("parses base+increment time control", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.timeControl).toEqual({
      initialSeconds: 600,
      incrementSeconds: 0,
      raw: "600+0",
    });
  });

  it("has an opening name — unlike Chess.com, Lichess's PGN carries one", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.opening.name).toBe("Pirc Defense");
  });

  it("detects clocks despite Lichess's spaced [%clk] formatting", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.hasClocks).toBe(true);
  });

  it("Termination is a short near-enum, unlike Chess.com's free sentence", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.termination).toBe("Normal");
  });
});

describe("normalizeGame — pgn paste, no clocks, no provenance", () => {
  const result = normalizeGame(FOOLS_MATE_PGN, {
    origin: "pgn",
    externalId: null,
    externalUrl: null,
  });

  it("still normalizes correctly with minimal headers", () => {
    if (isSyncFailure(result)) throw new Error("expected a NormalizedGame");
    expect(result.result).toBe("0-1");
    expect(result.hasClocks).toBe(false);
    expect(result.externalId).toBeNull();
  });

  it("respects an explicit perspective when given", () => {
    const withPerspective = normalizeGame(FOOLS_MATE_PGN, {
      origin: "pgn",
      externalId: null,
      externalUrl: null,
      perspective: "black",
    });
    if (isSyncFailure(withPerspective)) throw new Error("expected a NormalizedGame");
    expect(withPerspective.perspective).toBe("black");
  });
});

describe("normalizeGame — malformed input", () => {
  it("returns a SyncFailure for text with no game", () => {
    const result = normalizeGame("not a pgn at all", {
      origin: "pgn",
      externalId: null,
      externalUrl: null,
    });
    expect(isSyncFailure(result)).toBe(true);
  });
});
