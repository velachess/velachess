import { parsePgn, replayMainline, type Game, type PgnNodeData } from "@velachess/chess";
import { describe, expect, it } from "vitest";

import {
  adherenceMetrics,
  buildRepertoire,
  judgeAgainstChapters,
  judgmentType,
} from "@velachess/repertoire";

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

function chapterOf(pgn: string) {
  return buildRepertoire(firstGame(pgn)).unwrap();
}

function replayOf(pgn: string) {
  return replayMainline(firstGame(pgn)).unwrap();
}

const ITALIAN = "1. e4 e5 2. Nf3 Nc6 3. Bc4 *";
const RUY_LOPEZ = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *";
const CUSTOM_ROOT =
  '[FEN "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"]\n\n2. Nf3 d6 *';

describe("rootPositionKey", () => {
  it("is the standard starting position for a plain chapter", () => {
    expect(chapterOf(ITALIAN).rootPositionKey).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    );
  });

  it("is the custom position for a chapter with a starting FEN", () => {
    expect(chapterOf(CUSTOM_ROOT).rootPositionKey).toBe(
      "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    );
  });
});

describe("judgmentType", () => {
  it("names all four outcomes", () => {
    const ruy = chapterOf(RUY_LOPEZ);
    expect(judgmentType(findAgainst(ruy, "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *"))).toBe(
      "completed",
    );
    expect(judgmentType(findAgainst(ruy, "1. e4 e5 2. Nf3 Nc6 3. Bc4 *"))).toBe(
      "deviation",
    );
    expect(judgmentType(findAgainst(ruy, "1. e4 c5 *"))).toBe("gap");
    expect(
      judgmentType(findAgainst(ruy, "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *")),
    ).toBe("book-ended");
  });

  function findAgainst(chapter: ReturnType<typeof chapterOf>, gamePgn: string) {
    const judgment = judgeAgainstChapters([chapter], replayOf(gamePgn), "white");
    if (!judgment) throw new Error("expected a judgment");
    return judgment.result;
  }
});

describe("judgeAgainstChapters", () => {
  const chapters = [chapterOf(ITALIAN), chapterOf(RUY_LOPEZ)];

  it("picks the chapter that goes deepest", () => {
    // Diverges from the Italian at ply 5 (Bb5 ≠ Bc4) but follows the Ruy deeper.
    const judgment = judgeAgainstChapters(
      chapters,
      replayOf("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 *"),
      "white",
    );
    expect(judgment?.chapterIndex).toBe(1);
    expect(judgment?.result.inBookPlies).toBe(6);
  });

  it("a completed chapter wins outright", () => {
    const judgment = judgeAgainstChapters(
      chapters,
      replayOf("1. e4 e5 2. Nf3 Nc6 3. Bc4 *"),
      "white",
    );
    expect(judgment?.chapterIndex).toBe(0);
    expect(judgment?.result.event).toBeNull();
  });

  it("resolves depth ties to the lowest chapter index", () => {
    // Both chapters match e4 e5 Nf3 Nc6 and diverge at ply 5.
    const judgment = judgeAgainstChapters(
      chapters,
      replayOf("1. e4 e5 2. Nf3 Nc6 3. d4 *"),
      "white",
    );
    expect(judgment?.chapterIndex).toBe(0);
    expect(judgment?.result.inBookPlies).toBe(4);
  });

  it("skips chapters whose root position doesn't match the game", () => {
    const judgment = judgeAgainstChapters(
      [chapterOf(CUSTOM_ROOT), chapterOf(ITALIAN)],
      replayOf("1. e4 e5 2. Nf3 *"),
      "white",
    );
    expect(judgment?.chapterIndex).toBe(1);
  });

  it("returns null when no chapter applies or the game is empty", () => {
    expect(
      judgeAgainstChapters([chapterOf(CUSTOM_ROOT)], replayOf("1. d4 d5 *"), "white"),
    ).toBeNull();
    expect(judgeAgainstChapters([chapterOf(ITALIAN)], replayOf("*"), "white")).toBeNull();
  });
});

describe("adherenceMetrics", () => {
  const rows = [
    { type: "completed", inBookPlies: 10, gamePlies: 40, result: "win" },
    { type: "book-ended", inBookPlies: 8, gamePlies: 30, result: "loss" },
    { type: "gap", inBookPlies: 4, gamePlies: 25, result: "draw" },
    { type: "deviation", inBookPlies: 6, gamePlies: 50, result: "loss" },
    { type: "deviation", inBookPlies: 2, gamePlies: 35, result: "win" },
    { type: "deviation", inBookPlies: 1, gamePlies: 4 }, // below the floor
  ] as const;

  it("computes counts, rates, and prep depth over judged games only", () => {
    const m = adherenceMetrics([...rows]);

    expect(m.judgedGames).toBe(5);
    expect(m.skippedGames).toBe(1);
    expect(m.faithfulGames).toBe(3);
    expect(m.adherenceRate).toBeCloseTo(3 / 5, 10);
    expect(m.averagePrepDepth).toBeCloseTo((10 + 8 + 4 + 6 + 2) / 5, 10);

    expect(m.inBook).toEqual({ total: 3, wins: 1, draws: 1, losses: 1, winRate: 1 / 3 });
    expect(m.outOfBook).toEqual({
      total: 2,
      wins: 1,
      draws: 0,
      losses: 1,
      winRate: 1 / 2,
    });
  });

  it("ignores missing results in win rates without dropping the game from totals", () => {
    const m = adherenceMetrics([
      { type: "completed", inBookPlies: 6, gamePlies: 20 },
      { type: "completed", inBookPlies: 6, gamePlies: 20, result: "win" },
    ]);
    expect(m.inBook.total).toBe(2);
    expect(m.inBook.winRate).toBe(1);
  });

  it("is all zeros on an empty list — no NaN", () => {
    const m = adherenceMetrics([]);
    expect(m.judgedGames).toBe(0);
    expect(m.adherenceRate).toBe(0);
    expect(m.averagePrepDepth).toBe(0);
    expect(m.inBook.winRate).toBe(0);
  });

  it("respects a custom floor", () => {
    const m = adherenceMetrics([{ type: "completed", inBookPlies: 3, gamePlies: 10 }], {
      minJudgedPlies: 12,
    });
    expect(m.judgedGames).toBe(0);
    expect(m.skippedGames).toBe(1);
  });
});
