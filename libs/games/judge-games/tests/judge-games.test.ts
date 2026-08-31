// @vitest-environment node
/**
 * The ordering the extraction e2e cannot reach: the game is analysed
 * *first*, and only afterwards does a repertoire exist to judge it
 * against.
 *
 * That ordering is not exotic — it is what happens to anyone who reviews
 * a few games before building a book. The analysis ran when there were no
 * deviations, so its triage had nothing to seed; the judge then creates
 * the deviation already carrying severity, read from the cached report.
 * If the judge does not triage, that deviation never becomes an exercise
 * and nothing will ever re-analyse the game to fix it.
 *
 * The existing e2e runs the opposite order (judge enqueues, analysis
 * lands, analysis triages) and stays green either way — which is why
 * this file exists separately.
 */
import type { Database } from "@velachess/infra-db";
import {
  addChapter,
  applyEngineSignal,
  createRepertoire,
  createUser,
  games,
  getAnalysis,
  getRepertoireWithChapters,
  listExercisesByUser,
  listRepertoiresByUser,
  listUnjudgedGames,
  saveAnalysis,
  upsertJudgment,
  upsertTrackedAccount,
  upsertUnmatchedJudgment,
} from "@velachess/infra-db";
import { triageAndSeed } from "@velachess/drills";
import { createTestDb, type TestDb } from "@velachess/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { JudgeGamesDeps } from "../judge-games.ts";
import { judgeGamesForUser } from "../judge-games.ts";

/** The same adapter apps/server/src/composition/games.ts builds, restated
 * here: this test has no access to apps/server's composition, and
 * judge-games is narrow-deps, not Database-first. */
function judgeGamesDeps(db: Database): JudgeGamesDeps {
  return {
    listRepertoiresByUser: (userId) => listRepertoiresByUser(db, userId),
    getRepertoireWithChapters: (userId, repertoireId) =>
      getRepertoireWithChapters(db, userId, repertoireId),
    listUnjudgedGames: (userId, repertoireId) =>
      listUnjudgedGames(db, userId, repertoireId),
    upsertJudgment: (tx, input, result) => upsertJudgment(tx, input, result),
    upsertUnmatchedJudgment: (tx, input) =>
      upsertUnmatchedJudgment(tx, input).then(() => {}),
    getAnalysis: (gameId) => getAnalysis(db, gameId),
    applyEngineSignal: (tx, deviationId, signal) =>
      applyEngineSignal(tx, deviationId, signal).then(() => {}),
    // Judging never enqueues here, so this only has to exist.
    enqueueAnalysis: async () => {},
    withTransaction: (fn) => db.transaction(fn),
    seedDrillsAfterJudging: (userId) => triageAndSeed(db, userId).then(() => {}),
  };
}

/** The book says 1.d4; the game played 1.e4 and the engine hated it. */
const BOOK_PGN = "1. d4 d5 *";
const GAME_PGN = "1. e4 e5 *";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let harness: TestDb;
let db: Database;

beforeEach(async () => {
  harness = await createTestDb();
  db = harness.db;
});

afterEach(async () => {
  await harness.close();
});

describe("judgeGamesForUser", () => {
  it("seeds a drill from a deviation it judged against a cached report", async () => {
    const user = await createUser(db);
    const account = await upsertTrackedAccount(db, user.id, "lichess", "booked");

    const rep = await createRepertoire(db, {
      userId: user.id,
      name: "Book",
      color: "white",
    });
    await addChapter(db, {
      repertoireId: rep.id,
      name: "Queen's pawn",
      sortOrder: 1,
      pgn: BOOK_PGN,
      startingFen: null,
    });

    const [game] = await db
      .insert(games)
      .values({
        userId: user.id,
        accountId: account.id,
        source: "lichess",
        whiteName: "booked",
        blackName: "other",
        result: "*",
        hasClocks: false,
        rawPgn: GAME_PGN,
        movetextHash: "judge-triage-1",
        perspective: "white",
      })
      .returning();

    // The report exists *before* the judgment — the whole point.
    await saveAnalysis(db, game!.id, {
      engineVersion: "test",
      depth: 12,
      positions: [
        {
          ply: 1,
          fen: START,
          san: "e4",
          evalBefore: { cp: 20 },
          evalAfter: { cp: -400 },
          bestMove: "d2d4",
          category: "blunder",
          winChanceLoss: 0.45,
        },
      ],
    });

    const outcome = await judgeGamesForUser(judgeGamesDeps(db), user.id);
    expect(outcome.judged).toBe(1);

    const exercises = await listExercisesByUser(db, user.id);
    expect(exercises).toHaveLength(1);
    expect(exercises[0]!.expectedSans).toEqual(["d4"]);
  });
});
