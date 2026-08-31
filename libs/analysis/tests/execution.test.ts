// @vitest-environment node
/**
 * process-analysis's own execution contract — TOCTOU, disconnect vs.
 * cancel, and how request-analysis composes states around it — against
 * the real harness (PGlite + migrations + advisory lock, Stockfish real).
 *
 * Moved out of the old cross-module `libs/application` integration suite
 * (now `tests/application.test.ts` at the repo root): these three tests
 * exercise `tryStartAnalysis`'s own locking/streaming contract, which is
 * private to this module — not a cross-module pipeline fact, so they
 * belong with the slice that owns it, not the root suite. The fixture
 * below (sync a looper account, add a French chapter, judge) exists only
 * to produce one real deviant game to analyze; `@velachess/accounts` and
 * `@velachess/games` are devDependencies used for exactly that setup, and
 * drill-seeding fields these slices require are stubbed since seeding
 * itself isn't this file's concern.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";
import {
  addChapter,
  applyEngineSignal,
  appendProgress,
  clearProgress,
  createRepertoire,
  createUser,
  games,
  getAnalysis,
  getGame,
  getGameForUser,
  getRepertoireWithChapters,
  getTrackedAccount,
  getTrackedAccountForUser,
  listJudgmentsByGame,
  listRepertoiresByUser,
  listUnjudgedGames,
  markTrackedAccountSynced,
  saveAnalysis,
  saveGames,
  updateTrackedAccountCursor,
  upsertJudgment,
  upsertTrackedAccount,
  upsertUnmatchedJudgment,
  userIdForGame,
} from "@velachess/infra-db";
import { judgeGamesForUser, type JudgeGamesDeps } from "@velachess/games";
import { syncAccount, type SyncAccountDeps, type SyncDeps } from "@velachess/accounts";
import { requestAnalysis, type RequestAnalysisDeps } from "@velachess/analysis";
import type { AnalysisQueue } from "@velachess/infra-queue";
import { LOOPER_REPERTOIRE_PGN, LOOPER_USERNAME } from "@velachess/fixtures";
import {
  chessComFixtureFetch,
  createLoopHarness,
  makeStockfishSession as makeSession,
  type LoopHarness,
} from "@velachess/test-utils";

// tryStartAnalysis is private to this slice (its only public entry is
// completeAnalysis, which hides the execution/events this file asserts
// on) — reached here via relative path, the ordinary way a slice's own
// test reaches its sibling implementation file.
import { tryStartAnalysis } from "../process-analysis/process-analysis.ts";
import type { AnalyzeDeps } from "../process-analysis/process-analysis.ts";

let h: LoopHarness;
let userId: string;
let deviantGameId: string;

function syncAccountDeps(db: Database, fetch?: SyncDeps["fetch"]): SyncAccountDeps {
  return {
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    getTrackedAccountForUser: (forUserId, accountId) =>
      getTrackedAccountForUser(db, forUserId, accountId),
    saveGames: (newGameRows, opts) => saveGames(db, newGameRows, opts),
    updateTrackedAccountCursor: (accountId, cursor) =>
      updateTrackedAccountCursor(db, accountId, cursor),
    markTrackedAccountSynced: (accountId) => markTrackedAccountSynced(db, accountId),
    // syncAccount() never calls landNewGames itself (only
    // processAccountSync does) — this fixture only runs the fetch half.
    landNewGames: async () => ({ judged: 0, seeded: 0 }),
    ...(fetch ? { fetch } : {}),
  };
}

function judgeGamesDeps(db: Database, queue: AnalysisQueue): JudgeGamesDeps {
  return {
    listRepertoiresByUser: (forUserId) => listRepertoiresByUser(db, forUserId),
    getRepertoireWithChapters: (forUserId, repertoireId) =>
      getRepertoireWithChapters(db, forUserId, repertoireId),
    listUnjudgedGames: (forUserId, repertoireId) =>
      listUnjudgedGames(db, forUserId, repertoireId),
    upsertJudgment: (tx, input, result) => upsertJudgment(tx, input, result),
    upsertUnmatchedJudgment: (tx, input) =>
      upsertUnmatchedJudgment(tx, input).then(() => {}),
    getAnalysis: (gameId) => getAnalysis(db, gameId),
    applyEngineSignal: (tx, deviationId, signal) =>
      applyEngineSignal(tx, deviationId, signal).then(() => {}),
    enqueueAnalysis: (tx, gameId) => queue.enqueue(tx, gameId),
    withTransaction: (fn) => db.transaction(fn),
    // Drill seeding is out of scope for these analysis-focused tests.
    seedDrillsAfterJudging: async () => {},
  };
}

function analyzeDeps(db: Database, lock: LoopHarness["lock"]): AnalyzeDeps {
  return {
    makeSession,
    tryAcquireLock: (key) => lock.tryAcquire(key),
    getGame: (gameId) => getGame(db, gameId),
    getAnalysis: (gameId) => getAnalysis(db, gameId),
    withTransaction: (fn) => db.transaction(fn),
    saveAnalysis: (tx, gameId, data) => saveAnalysis(tx, gameId, data),
    listJudgmentsByGame: (tx, gameId) => listJudgmentsByGame(tx, gameId),
    applyEngineSignal: (tx, deviationId, signal) =>
      applyEngineSignal(tx, deviationId, signal).then(() => {}),
    appendProgress: (entry) => appendProgress(db, entry),
    clearProgress: (gameId) => clearProgress(db, gameId),
    userIdForGame: (gameId) => userIdForGame(db, gameId),
    // Drill seeding is out of scope for these analysis-focused tests.
    seedDrillsForGame: async () => {},
    depth: 8,
  };
}

function requestAnalysisDeps(db: Database, queue: AnalysisQueue): RequestAnalysisDeps {
  return {
    getGame: (gameId) => getGame(db, gameId),
    getGameForUser: (forUserId, gameId) => getGameForUser(db, forUserId, gameId),
    getAnalysis: (gameId) => getAnalysis(db, gameId),
    getQueueState: (gameId) => queue.getState(gameId),
    enqueueAnalysis: (gameId) => queue.enqueue(db, gameId),
  };
}

beforeAll(async () => {
  h = await createLoopHarness();

  userId = (await createUser(h.db)).id;
  const account = await upsertTrackedAccount(h.db, userId, "chess_com", LOOPER_USERNAME);
  await syncAccount(syncAccountDeps(h.db, chessComFixtureFetch()), account.id);

  const repertoire = await createRepertoire(h.db, {
    userId,
    name: "White",
    color: "white",
  });
  await addChapter(h.db, {
    repertoireId: repertoire.id,
    name: "French",
    sortOrder: 1,
    pgn: LOOPER_REPERTOIRE_PGN,
    startingFen: null,
  });

  const outcome = await judgeGamesForUser(judgeGamesDeps(h.db, h.analysisQueue), userId);
  expect(outcome.judged).toBe(2);

  const allGames = await h.db.select().from(games);
  for (const game of allGames) {
    const [judgment] = await listJudgmentsByGame(h.db, game.id);
    if (judgment?.type === "deviation") deviantGameId = game.id;
  }
  expect(deviantGameId).toBeDefined();
});

afterAll(() => h.close());

describe("process-analysis execution", () => {
  it("TOCTOU — two concurrent tryStart, exactly one starts", async () => {
    const deps = analyzeDeps(h.db, h.lock);
    const [a, b] = await Promise.all([
      tryStartAnalysis(deps, deviantGameId),
      tryStartAnalysis(deps, deviantGameId),
    ]);
    const statuses = [a.status, b.status].toSorted();
    expect(statuses).toEqual(["running", "started"]);

    const started = (a.status === "started" ? a : b) as Extract<
      typeof a,
      { status: "started" }
    >;

    // subscribe BEFORE start — first event must be index 0
    const seen: number[] = [];
    const consume = (async () => {
      for await (const event of started.execution.events) {
        if (event.type === "position") seen.push(event.index);
      }
    })();

    started.execution.start();
    const analysis = await started.execution.result;
    await consume;

    expect(seen[0]).toBe(0); // never lost the first event
    expect(analysis.positions.length).toBe(4);

    // atomic completion filled judgment severity in the same transaction
    const [judgment] = await listJudgmentsByGame(h.db, deviantGameId);
    expect(judgment!.engineCategory).not.toBeNull();
    expect(await getAnalysis(h.db, deviantGameId)).not.toBeNull();
  }, 120_000);

  it("disconnect ≠ cancel — aborted subscriber, result still persists", async () => {
    // fresh game without analysis
    const [game] = await h.db
      .insert(games)
      .values({
        userId,
        source: "pgn",
        whiteName: "w",
        blackName: "b",
        result: "*",
        hasClocks: false,
        rawPgn: "1. e4 e5 *",
        movetextHash: "sse-abort",
      })
      .returning();

    const start = await tryStartAnalysis(analyzeDeps(h.db, h.lock), game!.id);
    expect(start.status).toBe("started");
    const execution = (start as Extract<typeof start, { status: "started" }>).execution;

    // subscriber that abandons after the first event
    const abandoned = (async () => {
      for await (const event of execution.events) break;
    })();

    execution.start();
    await abandoned; // subscriber gone mid-flight
    const analysis = await execution.result; // execution continued regardless
    expect(analysis.positions.length).toBe(2);
    expect(await getAnalysis(h.db, game!.id)).not.toBeNull();
  }, 120_000);

  it("completed short-circuits, requestAnalysis composes states", async () => {
    const again = await tryStartAnalysis(analyzeDeps(h.db, h.lock), deviantGameId);
    expect(again.status).toBe("completed");

    const reqDeps = requestAnalysisDeps(h.db, h.analysisQueue);
    const request = await requestAnalysis(reqDeps, deviantGameId);
    expect(request.status).toBe("completed");

    const missing = await requestAnalysis(
      reqDeps,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(missing.status).toBe("not-found");
  });
});
