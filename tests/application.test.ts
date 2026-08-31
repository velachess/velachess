// @vitest-environment node
/**
 * Repository-wide integration suite: the full import -> judge -> seed ->
 * analyze -> drill pipeline exercised across the now-separate business
 * module packages, against the real harness (PGlite + migrations +
 * pg-boss + advisory lock), Stockfish real where the engine runs.
 *
 * Lives at the repo root, not inside any one module, because it is a
 * genuine cross-module fact: no single package owns "importing a game
 * eventually produces a graded drill." `process-analysis`'s own
 * TOCTOU/disconnect/streaming contract moved to
 * `libs/analysis/tests/execution.test.ts` — that behavior is private to
 * one slice, not a cross-module pipeline fact.
 */
import { makeScheduler } from "@velachess/scheduler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CardState, Grade, Scheduler } from "@velachess/scheduler";
import type { Database, DrillScope } from "@velachess/infra-db";
import type { GameFilters, GamePage } from "@velachess/infra-db";
import {
  addChapter,
  appendProgress,
  applyEngineSignal,
  clearJudgments,
  clearProgress,
  countDrillQueue,
  countJudgmentsByChapter,
  countJudgmentsByType,
  countTrainingByChapter,
  createUser,
  createRepertoire,
  deleteRepertoire,
  drillContextOf,
  findProviderProfiles,
  findRepertoireOfColor,
  getCard,
  getChapterForUser,
  getExerciseForUser,
  getJudgmentRows,
  getNewExercise,
  getOrCreateCard,
  getRepertoireWithChapters,
  isProfileFresh,
  listDueExercises,
  listGamesForExtraction,
  listGamesPage,
  listRepertoiresByUser,
  listUnjudgedGames,
  listUnmatchedGames,
  markRepertoireManual,
  markTrackedAccountSynced,
  renameRepertoire,
  replaceChapters,
  reopenNonPlayerJudgments,
  games,
  getAnalysis,
  getGame,
  getTrackedAccount,
  getTrackedAccountForUser,
  listExercisesByUser,
  listJudgmentsByGame,
  recordResponse,
  saveAnalysis,
  saveCard,
  saveGames,
  updateTrackedAccountCursor,
  upsertJudgment,
  upsertProviderProfile,
  upsertTrackedAccount,
  upsertUnmatchedJudgment,
  userIdForGame,
} from "@velachess/infra-db";
import {
  getNextDrillForUser,
  seedRepertoireLines,
  submitAnswer,
  triageAndSeed,
} from "@velachess/drills";
import {
  judgeGamesForUser,
  landNewGames,
  openLibrary,
  type JudgeGamesDeps,
  type LandNewGamesDeps,
  type ListGamesDeps,
} from "@velachess/games";
import {
  addChapter as addChapterToRepertoire,
  ensureCandidateRepertoires,
  extractRepertoire,
  getChapterDetail,
  getRepertoireDetail,
  REPERTOIRE_NAME,
  type AddChapterDeps,
  type ExtractRepertoireDeps,
  type GetChapterDeps,
  type GetRepertoireDeps,
} from "@velachess/repertoires";
import {
  importAccount,
  syncAccount,
  type ConnectAccountDeps,
  type SyncAccountDeps,
  type SyncDeps,
} from "@velachess/accounts";
import { completeAnalysis, type AnalyzeDeps } from "@velachess/analysis";

import type { AnalysisQueue } from "@velachess/infra-queue";

import {
  LISTER_USERNAME,
  LOOPER_FRENCH_ECOURL,
  LOOPER_REPERTOIRE_PGN,
  LOOPER_USERNAME,
} from "@velachess/fixtures";
import {
  chessComFixtureFetch,
  chessComListingFixtureFetch,
  createLoopHarness,
  makeStockfishSession as makeSession,
  type LoopHarness,
} from "@velachess/test-utils";

let h: LoopHarness;

/**
 * The same adapter apps/server/src/composition/drills.ts builds, restated
 * here: this harness has no access to apps/server's composition (libs
 * never import from apps), and @velachess/drills's get-next-drill/
 * submit-answer slices are narrow-deps, not Database-first.
 */
function nextDrillDeps(db: Database, scheduler: Scheduler) {
  return {
    listDueExercises: (userId: string, now: Date, scope: DrillScope) =>
      listDueExercises(db, userId, now, scope),
    getCard: (exerciseId: string) => getCard(db, exerciseId),
    drillContextOf: (exerciseId: string) => drillContextOf(db, exerciseId),
    getNewExercise: (userId: string, scope: DrillScope) =>
      getNewExercise(db, userId, scope),
    previewIntervals: (card: CardState, now: Date) =>
      scheduler.previewIntervals(card, now),
    newCard: (now: Date) => scheduler.newCard(now),
  };
}

/**
 * The same adapter apps/server/src/composition/games.ts builds, restated
 * here for the same reason as nextDrillDeps/submitAnswerDeps above:
 * @velachess/games's judge-games/list-games slices are narrow-deps, not
 * Database-first.
 */
function judgeGamesDeps(db: Database, queue: AnalysisQueue): JudgeGamesDeps {
  return {
    listRepertoiresByUser: (userId: string) => listRepertoiresByUser(db, userId),
    getRepertoireWithChapters: (userId: string, repertoireId: string) =>
      getRepertoireWithChapters(db, userId, repertoireId),
    listUnjudgedGames: (userId: string, repertoireId: string) =>
      listUnjudgedGames(db, userId, repertoireId),
    upsertJudgment: (tx, input, result) => upsertJudgment(tx, input, result),
    upsertUnmatchedJudgment: (tx, input) =>
      upsertUnmatchedJudgment(tx, input).then(() => {}),
    getAnalysis: (gameId: string) => getAnalysis(db, gameId),
    applyEngineSignal: (tx, deviationId, signal) =>
      applyEngineSignal(tx, deviationId, signal).then(() => {}),
    enqueueAnalysis: (tx, gameId) => queue.enqueue(tx, gameId),
    withTransaction: (fn) => db.transaction(fn),
    seedDrillsAfterJudging: (userId: string) => triageAndSeed(db, userId).then(() => {}),
  };
}

function listGamesDeps(db: Database): ListGamesDeps {
  return {
    listGamesPage: (userId, filters, page) => listGamesPage(db, userId, filters, page),
  };
}

function landNewGamesDeps(db: Database, queue: AnalysisQueue): LandNewGamesDeps {
  return {
    ensureCandidateRepertoires: (userId, opts) =>
      ensureCandidateRepertoires(db, userId, opts, (candidateUserId, repertoireId) =>
        seedRepertoireLines(db, candidateUserId, repertoireId),
      ).then(() => {}),
    judgeGamesForUser: (userId) => judgeGamesForUser(judgeGamesDeps(db, queue), userId),
    seedDrillsFromJudgments: (userId) => triageAndSeed(db, userId),
  };
}

/**
 * The same adapter apps/server/src/composition/accounts.ts's
 * buildSyncAccountDeps builds, restated here for the same reason as
 * nextDrillDeps/submitAnswerDeps above: @velachess/accounts's
 * sync-account slice is narrow-deps, not Database-first.
 */
function syncAccountDeps(
  db: Database,
  queue: AnalysisQueue,
  fetch?: SyncDeps["fetch"],
): SyncAccountDeps {
  return {
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    getTrackedAccountForUser: (userId, accountId) =>
      getTrackedAccountForUser(db, userId, accountId),
    saveGames: (newGameRows, opts) => saveGames(db, newGameRows, opts),
    updateTrackedAccountCursor: (accountId, cursor) =>
      updateTrackedAccountCursor(db, accountId, cursor),
    markTrackedAccountSynced: (accountId) => markTrackedAccountSynced(db, accountId),
    landNewGames: (userId, newGames) =>
      landNewGames(landNewGamesDeps(db, queue), userId, newGames),
    ...(fetch ? { fetch } : {}),
  };
}

function importAccountDeps(
  db: Database,
  queue: AnalysisQueue,
  fetch?: SyncDeps["fetch"],
): ConnectAccountDeps {
  const syncDeps = syncAccountDeps(db, queue, fetch);
  return {
    findProviderProfiles: (seats) => findProviderProfiles(db, seats),
    upsertProviderProfile: (seat, fetched) => upsertProviderProfile(db, seat, fetched),
    isProfileFresh,
    upsertTrackedAccount: (userId, platform, username) =>
      upsertTrackedAccount(db, userId, platform, username),
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    syncAccount: (accountId) => syncAccount(syncDeps, accountId),
    ensureCandidateRepertoires: (userId, opts) =>
      ensureCandidateRepertoires(db, userId, opts, (candidateUserId, repertoireId) =>
        seedRepertoireLines(db, candidateUserId, repertoireId),
      ).then(() => {}),
    ...(fetch ? { fetch } : {}),
  };
}

function submitAnswerDeps(db: Database, scheduler: Scheduler) {
  return {
    getExerciseForUser: (userId: string, exerciseId: string) =>
      getExerciseForUser(db, userId, exerciseId),
    getOrCreateCard: (exerciseId: string, fresh: CardState) =>
      getOrCreateCard(db, exerciseId, fresh),
    recordResponse: (
      exerciseId: string,
      response: Parameters<typeof recordResponse>[2],
    ) => recordResponse(db, exerciseId, response),
    saveCard: (exerciseId: string, state: CardState) => saveCard(db, exerciseId, state),
    newCard: (now: Date) => scheduler.newCard(now),
    reviewCard: (card: CardState, grade: Grade, now: Date) =>
      scheduler.review(card, grade, now),
  };
}

/**
 * The same adapters apps/server/src/composition/repertoires.ts builds,
 * restated here for the same reason as nextDrillDeps/submitAnswerDeps
 * above: @velachess/repertoires's add-chapter/get-chapter/get-repertoire/
 * extract-repertoire slices are narrow-deps, not Database-first.
 */
function addChapterDeps(db: Database): AddChapterDeps {
  return {
    getRepertoireWithChapters: (userId: string, repertoireId: string) =>
      getRepertoireWithChapters(db, userId, repertoireId),
    insertChapter: (tx, data) => addChapter(tx, data),
    markRepertoireManual: (tx, repertoireId: string) =>
      markRepertoireManual(tx, repertoireId),
    reopenNonPlayerJudgments: (tx, repertoireId: string) =>
      reopenNonPlayerJudgments(tx, repertoireId),
    withTransaction: (fn) => db.transaction(fn),
    seedRepertoireLines: (userId: string, repertoireId: string) =>
      seedRepertoireLines(db, userId, repertoireId),
  };
}

function getChapterDeps(db: Database): GetChapterDeps {
  return {
    getChapterForUser: (userId: string, repertoireId: string, chapterId: string) =>
      getChapterForUser(db, userId, repertoireId, chapterId),
  };
}

function getRepertoireDeps(db: Database): GetRepertoireDeps {
  return {
    getRepertoireWithChapters: (userId: string, repertoireId: string) =>
      getRepertoireWithChapters(db, userId, repertoireId),
    countJudgmentsByType: (repertoireId: string) =>
      countJudgmentsByType(db, repertoireId),
    countJudgmentsByChapter: (repertoireId: string) =>
      countJudgmentsByChapter(db, repertoireId),
    listUnmatchedGames: (repertoireId: string) => listUnmatchedGames(db, repertoireId),
    getJudgmentRows: (repertoireId: string) => getJudgmentRows(db, repertoireId),
    countTrainingByChapter: (userId: string, repertoireId: string) =>
      countTrainingByChapter(db, userId, repertoireId),
  };
}

function extractRepertoireDeps(db: Database): ExtractRepertoireDeps {
  return {
    listGamesForExtraction: (userId: string) => listGamesForExtraction(db, userId),
    findRepertoireOfColor: (userId: string, color) =>
      findRepertoireOfColor(db, userId, color),
    insertRepertoire: (tx, data) => createRepertoire(tx, data),
    renameRepertoire: (tx, repertoireId: string, name: string) =>
      renameRepertoire(tx, repertoireId, name),
    clearJudgments: (tx, repertoireId: string) => clearJudgments(tx, repertoireId),
    replaceChapters: (tx, repertoireId: string, chapters) =>
      replaceChapters(tx, repertoireId, chapters),
    withTransaction: (fn) => db.transaction(fn),
    seedRepertoireLines: (userId: string, repertoireId: string) =>
      seedRepertoireLines(db, userId, repertoireId),
  };
}

/**
 * The same adapter apps/worker/src/composition/analysis.ts builds,
 * restated here: `analysis/process-analysis`'s `completeAnalysis` is
 * narrow-deps, not Database-first. Used here only to seed a real,
 * persisted report for the deviant game — the TOCTOU/streaming behavior
 * of `tryStartAnalysis` itself (private to that slice) has its own suite
 * at `libs/analysis/tests/execution.test.ts`.
 */
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
    seedDrillsForGame: (userId, gameId) =>
      triageAndSeed(db, userId, { gameId }).then(() => {}),
    depth: 8,
  };
}

// No archives at all: the index is the only request the provider makes.
const emptyArchive: typeof fetch = async () =>
  new Response(JSON.stringify({ archives: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeAll(async () => {
  h = await createLoopHarness();
});

afterAll(() => h.close());

describe("application services (the flow, end to end)", () => {
  let userId: string;
  let deviantGameId: string;

  /**
   * Import (idempotent — first contact fills, later calls are no-ops)
   * then read the unified library: the write half and the read half of
   * what one function used to do before reads stopped creating
   * connections.
   */
  async function openImported(
    username: string,
    view: { filters?: GameFilters; page?: GamePage } = {},
    syncDeps: SyncDeps = {},
    ownerId: string = userId,
  ) {
    const account = await importAccount(
      importAccountDeps(h.db, h.analysisQueue, syncDeps.fetch),
      ownerId,
      "chess_com",
      username,
    );
    return { account, library: await openLibrary(listGamesDeps(h.db), ownerId, view) };
  }

  it("a user anchors the flow", async () => {
    // Identity now arrives from a session; the services still take a
    // plain userId, which is what this suite exercises.
    userId = (await createUser(h.db)).id;
    expect(userId).toBeTruthy();
  });

  it("sync: fixture archive lands as games, cursor advances, re-sync inserts nothing", async () => {
    const account = await upsertTrackedAccount(
      h.db,
      userId,
      "chess_com",
      LOOPER_USERNAME,
    );

    const first = await syncAccount(
      syncAccountDeps(h.db, h.analysisQueue, chessComFixtureFetch()),
      account.id,
    );
    expect(first.saved).toBe(2);
    expect(first.complete).toBe(true);
    expect((await getTrackedAccount(h.db, account.id))?.syncCursor).not.toBeNull();

    expect((await getTrackedAccount(h.db, account.id))?.lastSyncedAt).not.toBeNull();

    const second = await syncAccount(
      syncAccountDeps(h.db, h.analysisQueue, chessComFixtureFetch()),
      account.id,
    );
    expect(second.saved).toBe(0);
  });

  it("sync: an empty archive still marks the account as synced", async () => {
    // No games means no cursor to save. The two used to be one write, so an
    // account like this looked like one that had never synced — and the
    // route guard read that as a failed import.
    const account = await upsertTrackedAccount(h.db, userId, "chess_com", "emptyarchive");

    const outcome = await syncAccount(
      syncAccountDeps(h.db, h.analysisQueue, emptyArchive),
      account.id,
    );

    expect(outcome).toMatchObject({ saved: 0, complete: true });
    const synced = await getTrackedAccount(h.db, account.id);
    expect(synced?.syncCursor).toBeNull();
    expect(synced?.lastSyncedAt).not.toBeNull();
  });

  it("judge: perspective dispatch, judgment persisted, deviation enqueued transactionally", async () => {
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

    // enqueueAnalysis is opt-in: this test is about the enqueue sharing the
    // judgment's transaction. Importing never turns it on.
    const outcome = await judgeGamesForUser(
      judgeGamesDeps(h.db, h.analysisQueue),
      userId,
      {
        enqueueAnalysis: true,
      },
    );
    expect(outcome.judged).toBe(2);
    expect(outcome.enqueuedForAnalysis).toBe(1); // only the 2.g4 game deviates

    const allGames = await h.db.select().from(games);
    for (const game of allGames) {
      const [judgment] = await listJudgmentsByGame(h.db, game.id);
      expect(judgment).toBeDefined();
      if (judgment!.type === "deviation") {
        deviantGameId = game.id;
        expect(await h.analysisQueue.getState(game.id)).toBe("queued");
      }
    }
    expect(deviantGameId).toBeDefined();

    // re-run: idempotent, no new enqueue (stately + no unjudged games left)
    const again = await judgeGamesForUser(judgeGamesDeps(h.db, h.analysisQueue), userId);
    expect(again.judged).toBe(0);
  });

  it("analyze: the deviant game gets a real, persisted report and seeds its exercise", async () => {
    // `completeAnalysis` is the same public entry apps/worker's analysis
    // consumer calls — its own TOCTOU/streaming contract is covered at
    // libs/analysis/tests/execution.test.ts. Persisting here (rather than
    // the later manual triage test) also exercises the actual
    // get-analysis <-> judge-games boundary the "already cached" judging
    // test below relies on.
    await completeAnalysis(analyzeDeps(h.db, h.lock), deviantGameId);

    const analysis = await getAnalysis(h.db, deviantGameId);
    expect(analysis).not.toBeNull();

    const [judgment] = await listJudgmentsByGame(h.db, deviantGameId);
    expect(judgment!.engineCategory).not.toBeNull();

    // completeAnalysis seeds the game's own deviation as a side effect —
    // the harmful mistake is trainable the moment the report lands.
    const seeded = await listExercisesByUser(h.db, userId);
    expect(seeded).toHaveLength(1);
    expect(seeded[0]!.expectedSans).toEqual(["d4"]);
  }, 120_000);

  it("triage: a full pass over the archive finds nothing new to seed", async () => {
    // Exercises are positions, seeds are provenances — the deviation and
    // the engine blunder here are the same position, so a re-scan would
    // land two seeds on one exercise if it weren't idempotent. It is: the
    // analyze step above already seeded it as a side effect of
    // completeAnalysis, so a full manual pass over the archive is a
    // genuine no-op, not merely a repeat of the same seed.
    const outcome = await triageAndSeed(h.db, userId);
    expect(outcome.seeded).toBe(0);

    const seeded = await listExercisesByUser(h.db, userId);
    expect(seeded).toHaveLength(1);
    expect(seeded[0]!.expectedSans).toEqual(["d4"]);
  });

  it("review: new exercise served with playable FEN and previews; answers grade and schedule", async () => {
    const scheduler = makeScheduler();
    const item = await getNextDrillForUser(nextDrillDeps(h.db, scheduler), userId);
    expect(item).not.toBeNull();
    expect(item!.phase).toBe("new");
    expect(item!.fen).toContain(" w ");
    expect(item!.previews.good.intervalDays).toBeGreaterThan(0);

    const right = await submitAnswer(submitAnswerDeps(h.db, scheduler), userId, {
      exerciseId: item!.exerciseId,
      san: "d4",
      responseTimeMs: 1200,
    });
    expect(right!.correct).toBe(true);
    expect(right!.grade).toBe("good");
    expect(right!.nextDue.getTime()).toBeGreaterThan(Date.now());

    const wrong = await submitAnswer(submitAnswerDeps(h.db, scheduler), userId, {
      exerciseId: item!.exerciseId,
      san: "Qh5",
    });
    expect(wrong!.correct).toBe(false);
    expect(wrong!.grade).toBe("again");
  });

  it("extract: the synced games become a descriptive book, idempotently", async () => {
    // A colour holds one book, and the white one here is the user's own
    // — written by hand in the judge test above. Extraction refuses it
    // before deriving anything; only once it is gone is there a
    // candidate to write.
    const [confirmed] = await listRepertoiresByUser(h.db, userId);
    expect(await extractRepertoire(extractRepertoireDeps(h.db), userId, "white")).toEqual(
      {
        status: "refused-confirmed",
        repertoireId: confirmed!.id,
      },
    );
    await deleteRepertoire(h.db, userId, confirmed!.id);

    // The two synced games share "1. e4 e6" — with minGames 2 that prefix
    // is the whole extracted book.
    const outcome = await extractRepertoire(extractRepertoireDeps(h.db), userId, "white");
    if (outcome.status !== "extracted") throw new Error("expected extraction");
    expect(outcome.gamesConsidered).toBe(2);
    expect(outcome.chapters).toBe(1);

    const loaded = await getRepertoireWithChapters(h.db, userId, outcome.repertoireId);
    expect(loaded!.name).toBe(REPERTOIRE_NAME.white);
    expect(loaded!.source).toBe("extracted");
    expect(loaded!.chapters[0]!.pgn).toBe("1. e4 e6 *");

    // Re-extraction replaces instead of piling up — the target is still a
    // candidate, so the overwrite is allowed.
    const again = await extractRepertoire(extractRepertoireDeps(h.db), userId, "white");
    if (again.status !== "extracted") throw new Error("expected extraction");
    expect(again.repertoireId).toBe(outcome.repertoireId);
    expect(
      (await getRepertoireWithChapters(h.db, userId, outcome.repertoireId))!.chapters,
    ).toHaveLength(1);
  });

  it("judge reaches already-judged games through the new repertoire", async () => {
    // Both games were judged by the hand-written repertoire cycles ago —
    // they are still PENDING for the freshly extracted one, which is
    // per-repertoire semantics, so judging reaches them again.
    const outcome = await judgeGamesForUser(
      judgeGamesDeps(h.db, h.analysisQueue),
      userId,
    );
    expect(outcome.judged).toBe(2); // the extracted book re-reached both

    // Idempotent for this repertoire too.
    const again = await judgeGamesForUser(judgeGamesDeps(h.db, h.analysisQueue), userId);
    expect(again.judged).toBe(0);
  });

  it("judging a game whose analysis is already cached fills severity in-tx, no enqueue", async () => {
    // Per-repertoire re-judging makes "analysis before judgment" normal.
    // A d4-only book turns both games (which open 1.e4) into
    // own-deviations at ply 1. The deviant game already has a cached
    // report from earlier tests — its severity must fill from the cache
    // inside the judgment transaction, skipping the queue.
    const [extracted] = await listRepertoiresByUser(h.db, userId);
    await deleteRepertoire(h.db, userId, extracted!.id);
    const d4Book = await createRepertoire(h.db, {
      userId,
      name: "Queen's pawn",
      color: "white",
    });
    await addChapter(h.db, {
      repertoireId: d4Book.id,
      name: "Main",
      pgn: "1. d4 d5 *",
      sortOrder: 0,
    });

    const outcome = await judgeGamesForUser(
      judgeGamesDeps(h.db, h.analysisQueue),
      userId,
      {
        enqueueAnalysis: true,
      },
    );
    expect(outcome.judged).toBe(2);
    // Only the deviant game has a cached report (analyzed earlier in this
    // suite): its severity fills in-tx with NO enqueue. The other game has
    // no analysis yet — that one still goes to the queue.
    expect(outcome.enqueuedForAnalysis).toBe(1);

    const cached = (await listJudgmentsByGame(h.db, deviantGameId)).find(
      (j) => j.repertoireId === d4Book.id,
    )!;
    expect(cached.type).toBe("deviation");
    expect(cached.engineCategory).not.toBeNull();
  });

  it("importAccount: a first import fills the archive, a second one only reads", async () => {
    // Its own movetext: games dedupe per user and account, so reusing
    // the looper fixture here would save nothing and prove nothing.
    const freshArchive: typeof fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/archives")) {
        return Response.json({
          archives: ["https://api.chess.com/pub/player/fresh_import/games/2026/08"],
        });
      }
      return Response.json({
        games: [
          {
            url: "https://www.chess.com/game/live/9001",
            pgn: '[White "fresh_import"]\n[Black "opponent"]\n[Result "1-0"]\n\n1. b3 e5 2. Bb2 Nc6 1-0',
            rules: "chess",
            end_time: 1755200000,
          },
          {
            url: "https://www.chess.com/game/live/9002",
            pgn: '[White "opponent"]\n[Black "fresh_import"]\n[Result "0-1"]\n\n1. f4 d5 2. Nf3 Nf6 0-1',
            rules: "chess",
            end_time: 1755200100,
          },
        ],
      });
    }) as typeof fetch;

    // The unified library is per user — a fresh one, so these
    // assertions see exactly this import and nothing earlier in the
    // suite.
    const ownerId = (await createUser(h.db)).id;
    const { account, library } = await openImported(
      "Fresh_Import",
      {},
      { fetch: freshArchive },
      ownerId,
    );

    // Username normalised on the way in, games listed with status.
    expect(account.username).toBe("fresh_import");
    expect(account.lastSyncedAt).not.toBeNull();
    expect(library.games.length).toBe(2);

    // Which side was you is DERIVED for synced games, not stored: the
    // normalizer sees a PGN and no identity, so `games.perspective` is
    // null on everything synced. Without this derivation the list called
    // every game unfinished and drew every player white. The fixture has
    // one game from each seat.
    const bySeat = Object.fromEntries(library.games.map((g) => [g.perspective, g]));
    expect(Object.keys(bySeat).toSorted()).toEqual(["black", "white"]);
    expect(bySeat.white!.whiteName).toBe("fresh_import");
    expect(bySeat.black!.blackName).toBe("fresh_import");

    // Importing runs no engine. Judging is replay and analysis is intent —
    // an archive of hundreds of games must not queue hundreds of runs.
    for (const game of library.games) {
      expect(await h.analysisQueue.getState(game.id)).toBe("none");
      expect(game.analyzed).toBe(false);
    }

    // Second import never pulls the archive again: a fetch that would throw
    // on any game request. The profile endpoint is answered instead of
    // throwing — a re-import still refreshes identity by design — and
    // returning no avatar keeps what was stored.
    const again = await openImported(
      "fresh_import",
      {},
      {
        fetch: (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (/\/pub\/player\/[^/]+$/.test(url)) {
            return Response.json({ username: "fresh_import" });
          }
          throw new Error("the archive was already filled");
        }) as unknown as typeof fetch,
      },
      ownerId,
    );
    expect(again.account.id).toBe(account.id);
    expect(again.library.games.length).toBe(2);
  });

  it("the library list: every field the games list renders survives the trip", async () => {
    // The contract test the list never had. Its columns read ratings, a
    // clock, an opening and a platform link — none of which the judging
    // fixtures carry, so a green suite said nothing about whether the
    // pipeline delivers them. This archive is tagged like a real one.
    const { library } = await openImported(
      LISTER_USERNAME,
      {},
      { fetch: chessComListingFixtureFetch() },
      // Same isolation: this user's library holds only what it imports.
      (await createUser(h.db)).id,
    );

    expect(library.games).toHaveLength(2);
    const asWhite = library.games.find((game) => game.perspective === "white")!;
    const asBlack = library.games.find((game) => game.perspective === "black")!;
    expect(asWhite).toBeDefined();
    expect(asBlack).toBeDefined();

    for (const game of library.games) {
      expect(game.whiteRating, "white rating").not.toBeNull();
      expect(game.blackRating, "black rating").not.toBeNull();
      expect(game.playedAt, "played at").not.toBeNull();
      expect(game.openingName, "opening").not.toBeNull();
      expect(game.externalUrl, "platform link").not.toBeNull();
      expect(game.timeControlInitialSeconds, "clock").not.toBeNull();
      expect(game.source).toBe("chess_com");
    }

    // Won from white's seat, lost from black's — the same "1-0" both times.
    expect(asWhite.result).toBe("1-0");
    expect(asBlack.result).toBe("1-0");
    expect(asWhite.openingName).toBe("French Defense");

    // 3+2 keeps its increment; without it the row would read "3 min".
    expect(asBlack.timeControlInitialSeconds).toBe(180);
    expect(asBlack.timeControlIncrementSeconds).toBe(2);
  });

  it("library filters read the derived seat, not the stored column", async () => {
    // The filter and the column have to agree. Pointed at the stored
    // `perspective` (null on everything synced) this returns nothing while
    // the list happily shows wins.
    const ownerId = (await createUser(h.db)).id;
    await openImported(
      LISTER_USERNAME,
      {},
      { fetch: chessComListingFixtureFetch() },
      ownerId,
    );

    const won = await openLibrary(listGamesDeps(h.db), ownerId, {
      filters: { outcome: "win" },
    });
    expect(won.games).toHaveLength(1);
    expect(won.games[0]!.perspective).toBe("white");
    expect(won.total).toBe(1);

    const lost = await openLibrary(listGamesDeps(h.db), ownerId, {
      filters: { outcome: "loss" },
    });
    expect(lost.games).toHaveLength(1);
    expect(lost.games[0]!.perspective).toBe("black");

    const asBlack = await openLibrary(listGamesDeps(h.db), ownerId, {
      filters: { color: "black" },
    });
    expect(asBlack.games).toHaveLength(1);

    // 10 min is rapid; 3+2 estimates to 300s, which is blitz.
    const blitz = await openLibrary(listGamesDeps(h.db), ownerId, {
      filters: { timeClass: "blitz" },
    });
    expect(blitz.games).toHaveLength(1);
    expect(blitz.games[0]!.timeControlInitialSeconds).toBe(180);
  });

  it("a page is a slice of the whole, and total ignores it", async () => {
    // Fresh owner again: the pager's totals must count one import, not
    // everything the suite has accumulated.
    const ownerId = (await createUser(h.db)).id;
    await openImported(
      LISTER_USERNAME,
      {},
      { fetch: chessComListingFixtureFetch() },
      ownerId,
    );
    const first = await openLibrary(listGamesDeps(h.db), ownerId, {
      page: { page: 1, pageSize: 1 },
    });
    const second = await openLibrary(listGamesDeps(h.db), ownerId, {
      page: { page: 2, pageSize: 1 },
    });

    expect(first.games).toHaveLength(1);
    expect(second.games).toHaveLength(1);
    // Newest first, and no row on two pages — the reason the ordering is
    // total (played_at, then id) instead of just the date.
    expect(first.games[0]!.id).not.toBe(second.games[0]!.id);
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
  });
});

describe("triage without the engine (D1)", () => {
  // Its own harness: the point is a deviation whose game was NEVER
  // analysed, and the shared flow above analyses its deviant game.
  let fresh: LoopHarness;

  beforeAll(async () => {
    fresh = await createLoopHarness();
  });

  afterAll(() => fresh.close());

  it("a deviation in an unanalysed game still becomes a drill", async () => {
    const userId = (await createUser(fresh.db)).id;
    const account = await upsertTrackedAccount(
      fresh.db,
      userId,
      "chess_com",
      LOOPER_USERNAME,
    );
    await syncAccount(
      syncAccountDeps(fresh.db, fresh.analysisQueue, chessComFixtureFetch()),
      account.id,
    );

    const repertoire = await createRepertoire(fresh.db, {
      userId,
      name: "White",
      color: "white",
    });
    await addChapter(fresh.db, {
      repertoireId: repertoire.id,
      name: "French",
      sortOrder: 1,
      pgn: LOOPER_REPERTOIRE_PGN,
      startingFen: null,
    });

    // Judged, never analysed: enqueueAnalysis stays off, no engine runs,
    // and judging triages on its own — so the drill should exist already.
    // The trap this pins: the triage query used to require
    // engine_category, so this exact state seeded nothing, forever — a
    // game analysed before its repertoire existed was never re-analysed.
    await judgeGamesForUser(judgeGamesDeps(fresh.db, fresh.analysisQueue), userId);

    const seeded = await listExercisesByUser(fresh.db, userId);
    expect(seeded).toHaveLength(1);
    expect(seeded[0]!.expectedSans).toEqual(["d4"]);

    // And a manual pass finds nothing left to do.
    const again = await triageAndSeed(fresh.db, userId);
    expect(again.seeded).toBe(0);
  });
});

describe("the repertoire → deviations → training loop", () => {
  // Its own harness and its own user: this suite exercises the five
  // mutually exclusive judgment outcomes and the repertoire-line origin,
  // and the shared flow above would contaminate the counts.
  let loop: LoopHarness;
  let userId: string;
  let accountId: string;
  let repertoireId: string;
  let chapterId: string;

  beforeAll(async () => {
    loop = await createLoopHarness();
    userId = (await createUser(loop.db)).id;
    const account = await upsertTrackedAccount(
      loop.db,
      userId,
      "chess_com",
      LOOPER_USERNAME,
    );
    accountId = account.id;
    await syncAccount(
      syncAccountDeps(loop.db, loop.analysisQueue, chessComFixtureFetch()),
      account.id,
    );
  });

  afterAll(() => loop.close());

  it("a chapter that does not build is rejected before any write", async () => {
    const repertoire = await createRepertoire(loop.db, {
      userId,
      name: "White",
      color: "white",
    });
    repertoireId = repertoire.id;

    const outcome = await addChapterToRepertoire(
      addChapterDeps(loop.db),
      userId,
      repertoireId,
      {
        name: "Typo",
        pgn: "1. e9 zz *",
        sortOrder: 0,
      },
    );
    expect(outcome.status).toBe("invalid-pgn");
    expect(
      (await getRepertoireWithChapters(loop.db, userId, repertoireId))!.chapters,
    ).toHaveLength(0);
  });

  it("adding a chapter seeds its decision positions as repertoire-line", async () => {
    const outcome = await addChapterToRepertoire(
      addChapterDeps(loop.db),
      userId,
      repertoireId,
      {
        name: "French",
        pgn: LOOPER_REPERTOIRE_PGN, // 1. e4 e6 2. d4 d5 3. Nc3
        sortOrder: 0,
      },
    );
    if (outcome.status !== "added") throw new Error("expected added");
    chapterId = outcome.chapter.id;

    // Three White decisions: the start, after 1...e6, after 2...d5.
    expect(outcome.seeded).toBe(3);
    expect(await listExercisesByUser(loop.db, userId)).toHaveLength(3);

    // Idempotent: reseeding refreshes, never doubles.
    const again = await seedRepertoireLines(loop.db, userId, repertoireId);
    expect(again.positions).toBe(3);
    expect(await listExercisesByUser(loop.db, userId)).toHaveLength(3);
  });

  it("judging lands each game on exactly one of the five outcomes", async () => {
    // Two more games beyond the synced pair: an opponent who leaves book
    // at once (1...c5 was never prepared), and a PGN with no readable
    // moves — the unmatched case.
    const [gapGame] = await loop.db
      .insert(games)
      .values({
        userId,
        accountId,
        source: "chess_com",
        perspective: null,
        whiteName: "Looper",
        blackName: "rival",
        result: "0-1",
        playedAt: new Date("2026-08-03T10:00:00Z"),
        hasClocks: false,
        rawPgn: '[White "looper"]\n[Black "rival"]\n[Result "0-1"]\n\n1. e4 c5 0-1\n',
        movetextHash: "loop-gap",
      })
      .returning();
    await loop.db.insert(games).values({
      userId,
      accountId,
      source: "chess_com",
      perspective: null,
      whiteName: "Looper",
      blackName: "rival",
      result: "*",
      playedAt: new Date("2026-08-03T11:00:00Z"),
      hasClocks: false,
      openingUrl: LOOPER_FRENCH_ECOURL,
      rawPgn: "*",
      movetextHash: "loop-unmatched",
    });

    const outcome = await judgeGamesForUser(
      judgeGamesDeps(loop.db, loop.analysisQueue),
      userId,
    );
    // deviant (playerLeft) + in-book (held) + gap (opponentLeft) judged;
    // the moveless one persisted as unmatched, counted as skipped.
    expect(outcome.judged).toBe(3);
    expect(outcome.skipped).toBe(1);

    const gapJudgments = await listJudgmentsByGame(loop.db, gapGame!.id);
    expect(gapJudgments).toHaveLength(1);
    expect(gapJudgments[0]!.type).toBe("gap");
    expect(gapJudgments[0]!.playedSan).toBe("c5");

    // Unmatched is a persisted answer, not an eternal rescan: the next
    // run finds nothing pending.
    const again = await judgeGamesForUser(
      judgeGamesDeps(loop.db, loop.analysisQueue),
      userId,
    );
    expect(again.judged).toBe(0);
    expect(again.skipped).toBe(0);
  });

  it("derives the statistics from the shared judgment rows", async () => {
    const detail = await getRepertoireDetail(
      getRepertoireDeps(loop.db),
      userId,
      repertoireId,
    );
    expect(detail).not.toBeNull();

    expect(detail!.stats.outcomes).toEqual({
      held: 1,
      playerLeft: 1,
      opponentLeft: 1,
      repertoireEnded: 0,
      unmatched: 1,
    });
    expect(detail!.stats.matchedGames).toBe(3);
    expect(detail!.stats.unmatchedGames).toBe(1);

    // The unmatched game opened as a French — the coverage worth adding.
    expect(detail!.stats.uncoveredOpenings).toEqual([
      { opening: "French Defense", games: 1 },
    ]);

    // Per chapter, on the chapter row itself: held 1, playerLeft 1 →
    // the owner followed it half the time it was tested — and the row
    // ships no PGN; the tree belongs to the chapter detail route.
    const chapter = detail!.chapters.find((c) => c.id === chapterId);
    expect(chapter?.adherenceRate).toBe(0.5);
    expect(chapter?.recallFailures).toBe(1);
    expect(chapter?.gaps).toBe(1);
    expect(chapter && "pgn" in chapter).toBe(false);
  });

  it("serves a chapter with tree, decision positions and root key", async () => {
    const outcome = await getChapterDetail(
      getChapterDeps(loop.db),
      userId,
      repertoireId,
      chapterId,
    );
    if (outcome.status !== "found") throw new Error("expected found");

    expect(outcome.chapter.color).toBe("white");
    // Board-ready and already interpreted: the screen maps, never
    // computes. 1. e4 e6 2. d4 d5 3. Nc3 as one labeled mainline.
    expect(outcome.chapter.start.fen).toContain(" w ");
    expect(outcome.chapter.start.isOwnTurn).toBe(true);
    expect(outcome.chapter.start.prepared.map((move) => move.san)).toEqual(["e4"]);

    expect(outcome.chapter.lines).toHaveLength(1);
    expect(outcome.chapter.lines[0]!.moves.map((move) => move.label)).toEqual([
      "1. e4",
      "e6",
      "2. d4",
      "d5",
      "3. Nc3",
    ]);
    expect(outcome.chapter.lines[0]!.moves[0]).toMatchObject({ from: "e2", to: "e4" });
    expect(outcome.chapter.illegalMoves).toEqual([]);

    const stranger = (await createUser(loop.db)).id;
    expect(
      (await getChapterDetail(getChapterDeps(loop.db), stranger, repertoireId, chapterId))
        .status,
    ).toBe("not-found");
  });

  it("scopes the queue and the next drill to a slice of the pile", async () => {
    // All chapter positions plus the deviation collapse to 3 exercises;
    // the deviation shares the "after 1...e6" position with a line.
    const whole = await countDrillQueue(loop.db, userId, new Date());
    expect(whole.fresh).toBe(3);
    expect(whole.byOrigin["repertoire-line"]).toBe(3);
    expect(whole.byOrigin["repertoire-deviation"]).toBe(1);

    const chapterOnly = await countDrillQueue(loop.db, userId, new Date(), {
      chapterId,
    });
    expect(chapterOnly.fresh).toBe(3);

    const deviationOnly = await getNextDrillForUser(
      nextDrillDeps(loop.db, makeScheduler()),
      userId,
      new Date(),
      { origin: "repertoire-deviation" },
    );
    expect(deviationOnly?.context?.origin).toBe("repertoire-deviation");
    // The deviation explains the drill even though a line shares it.
    expect(deviationOnly?.context?.playedSan).toBe("g4");
  });

  it("a real-game failure pulls an already-scheduled position to now", async () => {
    const scheduler = makeScheduler();

    // Answer the deviation exercise correctly — its card schedules into
    // the future.
    const item = await getNextDrillForUser(
      nextDrillDeps(loop.db, scheduler),
      userId,
      new Date(),
      { origin: "repertoire-deviation" },
    );
    const answered = await submitAnswer(submitAnswerDeps(loop.db, scheduler), userId, {
      exerciseId: item!.exerciseId,
      san: "d4",
    });
    expect(answered!.correct).toBe(true);
    expect(new Date(answered!.nextDue).getTime()).toBeGreaterThan(Date.now());

    // A NEW game fails the same prepared position (2.h4 instead of d4).
    await loop.db.insert(games).values({
      userId,
      accountId,
      source: "chess_com",
      perspective: null,
      whiteName: "Looper",
      blackName: "rival",
      result: "0-1",
      playedAt: new Date("2026-08-04T10:00:00Z"),
      hasClocks: false,
      rawPgn:
        '[White "looper"]\n[Black "rival"]\n[Result "0-1"]\n\n1. e4 e6 2. h4 d5 0-1\n',
      movetextHash: "loop-repeat-failure",
    });
    await judgeGamesForUser(judgeGamesDeps(loop.db, loop.analysisQueue), userId);

    // The card that was scheduled for the future is due again: failing
    // it in a real game is the strongest evidence the interval was too
    // long.
    const dueAgain = await getNextDrillForUser(
      nextDrillDeps(loop.db, scheduler),
      userId,
      new Date(),
      { origin: "repertoire-deviation" },
    );
    expect(dueAgain?.exerciseId).toBe(item!.exerciseId);
    expect(dueAgain?.phase).toBe("due");
  });

  it("extraction refuses to overwrite confirmed preparation", async () => {
    // The white book here is the user's own, written by hand in the
    // tests above: extraction refuses a colour whose book is confirmed,
    // rather than growing a second one beside it.
    expect(
      await extractRepertoire(extractRepertoireDeps(loop.db), userId, "white"),
    ).toEqual({
      status: "refused-confirmed",
      repertoireId,
    });
    await deleteRepertoire(loop.db, userId, repertoireId);

    const first = await extractRepertoire(
      extractRepertoireDeps(loop.db),
      userId,
      "white",
    );
    if (first.status !== "extracted") throw new Error("expected extraction");

    // A manual edit confirms the candidate…
    const edited = await addChapterToRepertoire(
      addChapterDeps(loop.db),
      userId,
      first.repertoireId,
      {
        name: "My d4 sideline",
        pgn: "1. d4 *",
        sortOrder: 99,
      },
    );
    expect(edited.status).toBe("added");

    // …after which re-extraction is a refusal, not a silent overwrite.
    const second = await extractRepertoire(
      extractRepertoireDeps(loop.db),
      userId,
      "white",
    );
    expect(second).toEqual({
      status: "refused-confirmed",
      repertoireId: first.repertoireId,
    });
    const kept = await getRepertoireWithChapters(loop.db, userId, first.repertoireId);
    expect(kept!.source).toBe("manual");
    expect(kept!.chapters.some((c) => c.name === "My d4 sideline")).toBe(true);
  });
});
