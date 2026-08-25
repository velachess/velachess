// @vitest-environment node
/**
 * Cycle-2 e2e: a two-chapter repertoire, chapter dispatch picking the
 * right one, gamePlies persisted, and getJudgmentRows → adherenceMetrics
 * over real judgments.
 */
import { parsePgn, replayMainline, type Game, type PgnNodeData } from "@velachess/chess";
import {
  adherenceMetrics,
  buildRepertoire,
  judgeAgainstChapters,
} from "@velachess/repertoire";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@velachess/db";
import {
  addChapter,
  createRepertoire,
  createUser,
  deviations,
  games,
  getJudgmentRows,
  getRepertoireWithChapters,
  repertoireChapters,
  repertoires,
  upsertJudgment,
  users,
} from "@velachess/db";

import { createTestDb } from "./test-db.ts";

const { db, close } = await createTestDb();

afterAll(() => close());

beforeEach(async () => {
  await db.delete(deviations);
  await db.delete(repertoireChapters);
  await db.delete(repertoires);
  await db.delete(games);
  await db.delete(users);
});

const ITALIAN = "1. e4 e5 2. Nf3 Nc6 3. Bc4 *";
const RUY_LOPEZ = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *";

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

function insertGame(
  database: Database,
  rawPgn: string,
  movetextHash: string,
  result: "1-0" | "0-1" | "1/2-1/2" | "*",
  perspective: "white" | "black" | null,
) {
  return database
    .insert(games)
    .values({
      source: "pgn",
      whiteName: "w",
      blackName: "b",
      result,
      hasClocks: false,
      rawPgn,
      movetextHash,
      perspective,
    })
    .returning()
    .then(([g]) => g!);
}

describe("cycle-2 acceptance: dispatch → judgment with gamePlies → adherence metrics", () => {
  it("attributes each game to the right chapter and aggregates coherently", async () => {
    const user = await createUser(db);
    const rep = await createRepertoire(db, {
      userId: user.id,
      name: "White",
      color: "white",
    });
    await addChapter(db, {
      repertoireId: rep.id,
      name: "Italian",
      sortOrder: 1,
      pgn: ITALIAN,
      startingFen: null,
    });
    await addChapter(db, {
      repertoireId: rep.id,
      name: "Ruy Lopez",
      sortOrder: 2,
      pgn: RUY_LOPEZ,
      startingFen: null,
    });

    const loaded = await getRepertoireWithChapters(db, user.id, rep.id);
    const chapters = loaded!.chapters.map((c) =>
      buildRepertoire(firstGame(c.pgn)).unwrap(),
    );

    // (pgn, result from white's POV, expected chapter, expected type)
    const scenarios = [
      {
        pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 *",
        result: "1-0",
        chapter: 0,
        type: "book-ended",
      },
      {
        pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O f6 *",
        result: "0-1",
        chapter: 1,
        type: "deviation",
      },
      {
        pgn: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 *",
        result: "1/2-1/2",
        chapter: 0,
        type: "gap",
      },
    ] as const;

    for (const [i, s] of scenarios.entries()) {
      const replay = replayMainline(firstGame(s.pgn)).unwrap();
      const judgment = judgeAgainstChapters(chapters, replay, loaded!.color);
      expect(judgment, s.pgn).not.toBeNull();
      expect(judgment!.chapterIndex, s.pgn).toBe(s.chapter);

      const chapterRow = loaded!.chapters[judgment!.chapterIndex]!;
      const game = await insertGame(db, s.pgn, `acc2-${i}`, s.result, "white");
      const saved = await upsertJudgment(
        db,
        {
          gameId: game.id,
          repertoireId: rep.id,
          chapterId: chapterRow.id,
          repertoireName: rep.name,
          chapterName: chapterRow.name,
          gamePlies: replay.moves.length,
        },
        judgment!.result,
      );
      expect(saved.type, s.pgn).toBe(s.type);
      expect(saved.gamePlies).toBe(replay.moves.length);
      expect(saved.chapterNameSnapshot).toBe(chapterRow.name);
    }

    const rows = await getJudgmentRows(db, rep.id);
    expect(rows).toHaveLength(3);

    const metrics = adherenceMetrics(rows);
    expect(metrics.judgedGames).toBe(3);
    expect(metrics.faithfulGames).toBe(2); // book-ended + gap; the deviation is the unfaithful one
    expect(metrics.adherenceRate).toBeCloseTo(2 / 3, 10);
    expect(metrics.inBook.wins).toBe(1); // the book-ended 1-0
    expect(metrics.inBook.draws).toBe(1); // the gap draw
    expect(metrics.outOfBook.losses).toBe(1); // the deviation 0-1
  });

  it("translates result × perspective into the owner's outcome", async () => {
    const user = await createUser(db);
    const rep = await createRepertoire(db, {
      userId: user.id,
      name: "Black",
      color: "black",
    });
    const chapter = await addChapter(db, {
      repertoireId: rep.id,
      name: "French",
      sortOrder: 1,
      pgn: "1. e4 e6 *",
      startingFen: null,
    });

    const cases = [
      { result: "0-1", perspective: "black", expected: "win" },
      { result: "1-0", perspective: "black", expected: "loss" },
      { result: "1/2-1/2", perspective: "black", expected: "draw" },
      { result: "*", perspective: "black", expected: undefined },
      { result: "0-1", perspective: null, expected: undefined },
    ] as const;

    for (const [i, c] of cases.entries()) {
      const replay = replayMainline(firstGame("1. e4 e6 *")).unwrap();
      const game = await insertGame(
        db,
        "1. e4 e6 *",
        `pov-${i}`,
        c.result,
        c.perspective,
      );
      await upsertJudgment(
        db,
        {
          gameId: game.id,
          repertoireId: rep.id,
          chapterId: chapter.id,
          repertoireName: rep.name,
          chapterName: chapter.name,
          gamePlies: replay.moves.length,
        },
        { inBookPlies: 2, event: null },
      );
    }

    const rows = await getJudgmentRows(db, rep.id);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.result)).toEqual([
      "win",
      "loss",
      "draw",
      undefined,
      undefined,
    ]);
  });

  it("excludes judgments without gamePlies instead of breaking the floor", async () => {
    const user = await createUser(db);
    const rep = await createRepertoire(db, {
      userId: user.id,
      name: "White",
      color: "white",
    });
    const chapter = await addChapter(db, {
      repertoireId: rep.id,
      name: "Italian",
      sortOrder: 1,
      pgn: ITALIAN,
      startingFen: null,
    });

    const game = await insertGame(db, ITALIAN, "old-judgment", "1-0", "white");
    await upsertJudgment(
      db,
      {
        gameId: game.id,
        repertoireId: rep.id,
        chapterId: chapter.id,
        repertoireName: rep.name,
        chapterName: chapter.name,
      },
      { inBookPlies: 5, event: null },
    );

    expect(await getJudgmentRows(db, rep.id)).toHaveLength(0);
  });
});
