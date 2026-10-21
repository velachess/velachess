import {
  CASTLING_AVAILABLE,
  EN_PASSANT_AVAILABLE,
  FOOLS_MATE_PGN,
  ILLEGAL_MOVE_PGN,
  MALFORMED_HEADER_PGN,
  MULTI_GAME_PGN,
  NO_LEGAL_MOVES_PGN,
  PAWN_PROMOTION_AVAILABLE,
  STALEMATE_KING_IN_CORNER,
} from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import {
  type Game,
  hasPlayableGame,
  INITIAL_FEN,
  type PgnNodeData,
  parsePgn,
  isPlayableGame,
  replayMainline,
} from "@velachess/chess";

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

describe("parsePgn", () => {
  it("parses headers and the mainline", () => {
    const game = firstGame(FOOLS_MATE_PGN);
    expect(game.headers.get("Result")).toBe("0-1");
    expect([...game.moves.mainline()].map((n) => n.san)).toEqual([
      "f3",
      "e5",
      "g4",
      "Qh4#",
    ]);
  });

  it("parses a multi-game PGN into separate games", () => {
    const games = parsePgn(MULTI_GAME_PGN);
    expect(games).toHaveLength(2);
    expect(games[0]?.headers.get("Event")).toBe("Fool's Mate");
    expect(games[1]?.headers.get("Event")).toBe("Unfinished");
  });
});

describe("replayMainline", () => {
  it("validates a fully legal game and reaches checkmate", () => {
    const game = firstGame(FOOLS_MATE_PGN);
    const replay = replayMainline(game).unwrap();

    expect(replay.legal).toBe(true);
    expect(replay.moves).toHaveLength(4);
    expect(replay.terminal).toEqual({ winner: "black" });
  });

  it("stops at the first illegal move", () => {
    const game = firstGame(ILLEGAL_MOVE_PGN);
    const replay = replayMainline(game).unwrap();

    expect(replay.legal).toBe(false);
    // e4, e5 — Ra3 never gets played.
    expect(replay.moves).toHaveLength(2);
    expect(replay.moves.map((m) => m.san)).toEqual(["e4", "e5"]);
  });

  it("records each move's FEN before and after", () => {
    const game = firstGame(FOOLS_MATE_PGN);
    const replay = replayMainline(game).unwrap();

    expect(replay.moves[0]?.fenBefore).toContain(" w ");
    expect(replay.moves[0]?.fenAfter).toContain(" b ");
  });
});

describe("the canonical replay", () => {
  it("defaults to the standard position when no FEN header says otherwise", () => {
    expect(replayMainline(firstGame(FOOLS_MATE_PGN)).unwrap().startFen).toBe(INITIAL_FEN);
  });

  it("numbers plies, and carries each move's side and move number", () => {
    const replay = replayMainline(firstGame(FOOLS_MATE_PGN)).unwrap();

    expect(replay.moves.map((m) => m.ply)).toEqual([1, 2, 3, 4]);
    expect(replay.moves.map((m) => m.side)).toEqual(["white", "black", "white", "black"]);
    // "1. f3 e5 2. g4 Qh4#" — both halves of a move share its number.
    expect(replay.moves.map((m) => m.moveNumber)).toEqual([1, 1, 2, 2]);
  });

  it("carries UCI beside SAN, so no reader converts one to the other", () => {
    const replay = replayMainline(firstGame(FOOLS_MATE_PGN)).unwrap();

    expect(replay.moves.map((m) => m.san)).toEqual(["f3", "e5", "g4", "Qh4#"]);
    expect(replay.moves.map((m) => m.uci)).toEqual(["f2f3", "e7e5", "g2g4", "d8h4"]);
  });

  it("starts from a custom position, numbering from where it left off", () => {
    const pgn = `[Event "Resumed"]\n[FEN "${EN_PASSANT_AVAILABLE}"]\n[SetUp "1"]\n\n3. exf6 *\n`;
    const replay = replayMainline(firstGame(pgn)).unwrap();

    expect(replay.startFen).toBe(EN_PASSANT_AVAILABLE);
    expect(replay.moves[0]?.side).toBe("white");
    expect(replay.moves[0]?.moveNumber).toBe(3);
    // En passant: the pawn lands on an empty square, capturing beside it.
    expect(replay.moves[0]?.uci).toBe("e5f6");
  });

  it("knows its starting position even with no moves at all", () => {
    const replay = replayMainline(firstGame('[Event "Empty"]\n\n*\n')).unwrap();

    expect(replay.moves).toEqual([]);
    expect(replay.startFen).toBe(INITIAL_FEN);
    expect(replay.terminal).toBeNull();
  });

  it("reports a draw as a terminal position with no winner", () => {
    const pgn = `[Event "Stalemate"]\n[FEN "${STALEMATE_KING_IN_CORNER}"]\n[SetUp "1"]\n\n*\n`;
    const replay = replayMainline(firstGame(pgn)).unwrap();

    expect(replay.terminal).toEqual({ winner: undefined });
  });

  it("reads terminal from the rules, not from the [Result] header", () => {
    // A resignation: White is recorded as winning, but nothing on the
    // board ended the game.
    const replay = replayMainline(
      firstGame('[Event "Resigned"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n'),
    ).unwrap();

    expect(replay.terminal).toBeNull();
    expect(replay.legal).toBe(true);
  });

  it("records promotion and castling in both notations", () => {
    const promotion = `[Event "P"]\n[FEN "${PAWN_PROMOTION_AVAILABLE}"]\n[SetUp "1"]\n\n1. a8=Q+ *\n`;
    expect(replayMainline(firstGame(promotion)).unwrap().moves[0]).toMatchObject({
      san: "a8=Q+",
      uci: "a7a8q",
    });

    const castling = `[Event "C"]\n[FEN "${CASTLING_AVAILABLE}"]\n[SetUp "1"]\n\n1. O-O *\n`;
    expect(replayMainline(firstGame(castling)).unwrap().moves[0]).toMatchObject({
      san: "O-O",
      uci: "e1g1",
    });
  });

  it("chains each move's position onto the next", () => {
    const replay = replayMainline(firstGame(FOOLS_MATE_PGN)).unwrap();

    expect(replay.moves[0]?.fenBefore).toBe(replay.startFen);
    for (const [index, move] of replay.moves.slice(1).entries()) {
      expect(move.fenBefore).toBe(replay.moves[index]?.fenAfter);
    }
  });
});

function verdict(pgn: string): boolean {
  const game = firstGame(pgn);
  return isPlayableGame(game.headers, replayMainline(game).unwrap());
}

describe("isPlayableGame", () => {
  it("accepts a game that played at least one legal move", () => {
    expect(verdict(FOOLS_MATE_PGN)).toBe(true);
  });

  it("accepts a game that goes illegal part-way — the legal prefix is a game", () => {
    expect(verdict(ILLEGAL_MOVE_PGN)).toBe(true);
  });

  it("refuses a game with headers but no legal move", () => {
    expect(verdict(NO_LEGAL_MOVES_PGN)).toBe(false);
  });

  it("refuses text that carries no headers", () => {
    expect(verdict("adkadsa")).toBe(false);
  });
});

describe("hasPlayableGame", () => {
  it("accepts a fully legal game", () => {
    expect(hasPlayableGame(FOOLS_MATE_PGN)).toBe(true);
  });

  it("accepts a game that goes illegal partway through — the legal prefix counts", () => {
    expect(hasPlayableGame(ILLEGAL_MOVE_PGN)).toBe(true);
  });

  it("accepts a multi-game PGN when at least one game is playable", () => {
    expect(hasPlayableGame(MULTI_GAME_PGN)).toBe(true);
  });

  it("rejects arbitrary text with no headers and no moves", () => {
    expect(hasPlayableGame("adkadsa")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(hasPlayableGame("")).toBe(false);
  });

  it("rejects malformed headers", () => {
    expect(hasPlayableGame(MALFORMED_HEADER_PGN)).toBe(false);
  });

  it("rejects a game whose very first move is illegal", () => {
    expect(hasPlayableGame(NO_LEGAL_MOVES_PGN)).toBe(false);
  });
});
