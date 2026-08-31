// @vitest-environment node
/**
 * Analysis cache + deviation severity, engine-real. Queue lifecycle belongs
 * to pg-boss and is tested in `libs/infra/queue`.
 */
import { createRequire } from "node:module";

import { engineSignalForDeviation } from "@velachess/analysis";
import { parsePgn, replayMainline, type Game, type PgnNodeData } from "@velachess/chess";
import { EngineSession } from "@velachess/infra-engine";
import { ChildProcessTransport } from "@velachess/infra-engine/transport-child-process";
import { buildRepertoire } from "@velachess/repertoires";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// findDeviation is private to games/judge-games (its only production
// consumer) — reached here via relative path; see adherence-flow.test.ts's
// comment on judgeAgainstChapters for why. analyzeGame is private to
// analysis/process-analysis the same way.
import { findDeviation } from "../../../games/judge-games/deviation.ts";
import { analyzeGame } from "../../../analysis/process-analysis/analyze-game.ts";

import type { Database } from "@velachess/infra-db";
import {
  addChapter,
  applyEngineSignal,
  createRepertoire,
  createUser,
  deviations,
  gameAnalyses,
  games,
  getAnalysis,
  repertoireChapters,
  repertoires,
  saveAnalysis,
  upsertJudgment,
  users,
} from "@velachess/infra-db";

import { createTestDb, createUserRow } from "./test-db.ts";

const require = createRequire(import.meta.url);
const enginePath = require.resolve("stockfish/bin/stockfish-18-lite-single.js");

async function makeStockfishSession(): Promise<EngineSession> {
  const session = new EngineSession(
    new ChildProcessTransport(process.execPath, [enginePath]),
  );
  await session.init();
  return session;
}

const { db, close } = await createTestDb();

afterAll(() => close());

let ownerId: string;

beforeEach(async () => {
  await db.delete(gameAnalyses);
  await db.delete(deviations);
  await db.delete(repertoireChapters);
  await db.delete(repertoires);
  await db.delete(games);
  await db.delete(users);
  ownerId = await createUserRow(db);
});

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

function insertGame(database: Database, rawPgn: string, movetextHash: string) {
  return database
    .insert(games)
    .values({
      userId: ownerId,
      source: "pgn",
      whiteName: "w",
      blackName: "b",
      result: "*",
      hasClocks: false,
      rawPgn,
      movetextHash,
    })
    .returning()
    .then(([g]) => g!);
}

describe("analysis cache", () => {
  it("saveAnalysis upserts; getAnalysis returns the report or null", async () => {
    const game = await insertGame(db, "1. e4 *", "c1");
    expect(await getAnalysis(db, game.id)).toBeNull();

    const positions = [
      {
        ply: 1,
        fen: "f",
        san: "e4",
        evalBefore: { cp: 20 },
        evalAfter: { cp: 25 },
        bestMove: "e2e4",
        category: "best",
        winChanceLoss: 0,
      },
    ] as never;
    await saveAnalysis(db, game.id, { engineVersion: "test-1", depth: 8, positions });
    await saveAnalysis(db, game.id, { engineVersion: "test-2", depth: 8, positions });

    const cached = await getAnalysis(db, game.id);
    expect(cached?.engineVersion).toBe("test-2");
    expect((await db.select().from(gameAnalyses)).length).toBe(1);
  });
});

describe("engine severity → judgment (real Stockfish)", () => {
  it("fills the cp_loss/engine_category a judgment left null", async () => {
    const GAME_PGN = "1. e4 e6 2. g4 d5 *";
    const CHAPTER_PGN = "1. e4 e6 2. d4 d5 3. Nc3 *";

    const user = await createUser(db);
    const rep = await createRepertoire(db, {
      userId: user.id,
      name: "White",
      color: "white",
    });
    const chapter = await addChapter(db, {
      repertoireId: rep.id,
      name: "French",
      sortOrder: 1,
      pgn: CHAPTER_PGN,
      startingFen: null,
    });
    const game = await insertGame(db, GAME_PGN, "acc1");

    const built = buildRepertoire(firstGame(CHAPTER_PGN)).unwrap();
    const replay = replayMainline(firstGame(GAME_PGN)).unwrap();
    const result = findDeviation(built, replay, "white");
    expect(result.event?.type).toBe("deviation");

    const judgment = await upsertJudgment(
      db,
      {
        gameId: game.id,
        repertoireId: rep.id,
        chapterId: chapter.id,
        repertoireName: rep.name,
        chapterName: chapter.name,
        gamePlies: replay.moves.length,
      },
      result,
    );
    expect(judgment.engineCategory).toBeNull();

    const positions = [];
    for await (const event of analyzeGame(firstGame(GAME_PGN), makeStockfishSession, {
      depth: 10,
    })) {
      if (event.type === "done") positions.push(...event.positions);
    }
    await saveAnalysis(db, game.id, {
      engineVersion: "stockfish-18-lite",
      depth: 10,
      positions,
    });

    const signal = engineSignalForDeviation(positions, judgment.ply!);
    const updated = await applyEngineSignal(db, judgment.id, signal!);
    expect(updated?.engineCategory).not.toBeNull();
    expect(typeof updated?.cpLoss).toBe("number");
  });
});
