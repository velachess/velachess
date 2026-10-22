import { parsePgn, replayMainline } from "@velachess/chess";
import { describe, expect, it } from "vitest";

import { classifyPly, terminalScoreOf } from "../grade-game.ts";

describe("classifyPly", () => {
  it("grades a ply from the evaluation before it and the one after it", () => {
    const replay = replayMainline(parsePgn("1. e4 e5 *")[0]!).unwrap();

    expect(
      classifyPly(
        1,
        replay.moves[0]!,
        { score: { cp: 20 }, bestMove: "e2e4" },
        { score: { cp: -300 }, bestMove: "d7d5" },
      ),
    ).toEqual({
      ply: 1,
      evalBefore: { cp: 20 },
      evalAfter: { cp: -300 },
      bestMove: "e2e4",
      // The engine's own move is `best` however much the eval then
      // drops; the loss is still reported.
      category: "best",
      winChanceLoss: expect.closeTo(0.539055, 6),
    });

    expect(
      classifyPly(
        2,
        replay.moves[1]!,
        { score: { cp: -300 }, bestMove: "d7d5" },
        { score: { cp: 10 }, bestMove: "g1f3" },
      ),
    ).toEqual({
      ply: 2,
      evalBefore: { cp: -300 },
      evalAfter: { cp: 10 },
      bestMove: "d7d5",
      category: "blunder",
      winChanceLoss: expect.closeTo(0.520659, 6),
    });
  });

  it("credits a castle the engine also chose", () => {
    // chessops encodes castling as king-takes-own-rook (e1h1); an engine
    // names the king's step (e1g1). If the replay carried the former, no
    // castle could ever be the engine's move.
    const pgn =
      '[Event "C"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]\n[SetUp "1"]\n\n1. O-O *\n';
    const replay = replayMainline(parsePgn(pgn)[0]!).unwrap();
    expect(replay.moves[0]?.uci).toBe("e1g1");

    const graded = classifyPly(
      1,
      replay.moves[0]!,
      { score: { cp: 0 }, bestMove: "e1g1" },
      { score: { cp: 0 }, bestMove: "e8g8" },
    );

    expect(graded.category).toBe("best");
  });
});

describe("terminalScoreOf", () => {
  it("scores a decided game as a mate for its winner and a draw as level", () => {
    expect(terminalScoreOf({ winner: "white" })).toEqual({ mate: 1 });
    expect(terminalScoreOf({ winner: "black" })).toEqual({ mate: -1 });
    expect(terminalScoreOf({ winner: undefined })).toEqual({ cp: 0 });
  });
});
