import { parsePgn, replayMainline, type Game, type PgnNodeData } from "@velachess/chess";
import { buildRepertoire } from "@velachess/repertoires";
import { describe, expect, it } from "vitest";

import { judgeAgainstChapters } from "../dispatch.ts";

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
