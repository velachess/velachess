import {
  CLOSED_RUY_LOPEZ_AFTER_EIGHT_MOVES,
  CLOSED_RUY_LOPEZ_PGN,
  EN_PASSANT_AVAILABLE,
  FOOLS_MATE_CHECKMATE,
  FOOLS_MATE_PGN,
  ILLEGAL_MOVE_PGN,
} from "@velachess/fixtures";
import { INITIAL_FEN } from "@velachess/chess";
import type { GameRow } from "@velachess/infra-db";
import { describe, expect, it } from "vitest";

import { openLibrary } from "./list-games.ts";

async function thumbnailOf(rawPgn: string) {
  const row: GameRow = {
    id: "game",
    whiteName: "white",
    whiteRating: null,
    blackName: "black",
    blackRating: null,
    result: "1-0",
    playedAt: null,
    perspective: null,
    source: "pgn",
    externalUrl: null,
    timeControlInitialSeconds: null,
    timeControlIncrementSeconds: null,
    openingName: null,
    rawPgn,
  };
  const library = await openLibrary(
    { listGamesPage: async () => ({ rows: [row], total: 1, page: 1, pageSize: 25 }) },
    "user",
  );
  expect(library.games[0]).not.toHaveProperty("rawPgn");
  return library.games[0]?.thumbnailFen;
}

describe("openLibrary thumbnailFen", () => {
  it("is the position after eight moves of a longer game", async () => {
    expect(await thumbnailOf(CLOSED_RUY_LOPEZ_PGN)).toBe(
      CLOSED_RUY_LOPEZ_AFTER_EIGHT_MOVES,
    );
  });

  it("is the last position of a shorter game", async () => {
    expect(await thumbnailOf(FOOLS_MATE_PGN)).toBe(FOOLS_MATE_CHECKMATE);
  });

  it("keeps the legal prefix of a game that turns illegal", async () => {
    expect(await thumbnailOf(ILLEGAL_MOVE_PGN)).toBe(
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    );
  });

  it("is the starting position when no move was played", async () => {
    expect(await thumbnailOf('[Event "Empty"]\n\n*\n')).toBe(INITIAL_FEN);
  });

  it("counts from a custom starting position", async () => {
    const pgn = `[Event "Resumed"]\n[FEN "${EN_PASSANT_AVAILABLE}"]\n[SetUp "1"]\n\n3. exf6 *\n`;

    expect(await thumbnailOf(pgn)).toContain(" b ");
  });

  it("is null when the starting position is unreadable", async () => {
    const pgn = '[Event "Broken"]\n[FEN "not a fen"]\n[SetUp "1"]\n\n1. e4 *\n';

    expect(await thumbnailOf(pgn)).toBeNull();
  });
});
