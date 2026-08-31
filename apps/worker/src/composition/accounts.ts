/**
 * Composition root for the accounts module's worker-side consumer: adapts
 * the DB client, analysis queue, and fetch-override fixture `main.ts`
 * already builds into the narrow `SyncAccountDeps` `processAccountSync`
 * declared. A duplicate of `apps/server/src/composition/accounts.ts`'s
 * `buildSyncAccountDeps` in shape only — apps never share a composition
 * helper (`no-cross-app-runtime-imports`), so each builds its own.
 */
import {
  applyEngineSignal,
  getAnalysis,
  getRepertoireWithChapters,
  getTrackedAccount,
  getTrackedAccountForUser,
  listRepertoiresByUser,
  listUnjudgedGames,
  markTrackedAccountSynced,
  saveGames,
  updateTrackedAccountCursor,
  upsertJudgment,
  upsertUnmatchedJudgment,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import type { SyncAccountDeps } from "@velachess/accounts";
import {
  judgeGamesForUser as judgeGamesForUserSlice,
  landNewGames as landNewGamesSlice,
} from "@velachess/games";
import type { JudgeGamesDeps, LandNewGamesDeps } from "@velachess/games";
import { seedRepertoireLines, triageAndSeed } from "@velachess/drills";
import { ensureCandidateRepertoires } from "@velachess/repertoires";
import type { FetchFn } from "@velachess/infra-platforms";
import type { AnalysisQueue } from "@velachess/infra-queue";

function buildJudgeGamesDeps(db: Database, analysisQueue: AnalysisQueue): JudgeGamesDeps {
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
    enqueueAnalysis: (tx, gameId) => analysisQueue.enqueue(tx, gameId),
    withTransaction: (fn) => db.transaction(fn),
    seedDrillsAfterJudging: (userId) => triageAndSeed(db, userId).then(() => {}),
  };
}

function buildLandNewGamesDeps(
  db: Database,
  analysisQueue: AnalysisQueue,
): LandNewGamesDeps {
  const judgeGamesDeps = buildJudgeGamesDeps(db, analysisQueue);
  return {
    ensureCandidateRepertoires: (userId, opts) =>
      ensureCandidateRepertoires(db, userId, opts, (candidateUserId, repertoireId) =>
        seedRepertoireLines(db, candidateUserId, repertoireId),
      ).then(() => {}),
    judgeGamesForUser: (userId) => judgeGamesForUserSlice(judgeGamesDeps, userId),
    seedDrillsFromJudgments: (userId) => triageAndSeed(db, userId),
  };
}

export function buildSyncAccountDeps(
  db: Database,
  analysisQueue: AnalysisQueue,
  fetch?: FetchFn,
): SyncAccountDeps {
  return {
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    getTrackedAccountForUser: (userId, accountId) =>
      getTrackedAccountForUser(db, userId, accountId),
    saveGames: (games, opts) => saveGames(db, games, opts),
    updateTrackedAccountCursor: (accountId, cursor) =>
      updateTrackedAccountCursor(db, accountId, cursor),
    markTrackedAccountSynced: (accountId) => markTrackedAccountSynced(db, accountId),
    landNewGames: (userId, newGames) =>
      landNewGamesSlice(buildLandNewGamesDeps(db, analysisQueue), userId, newGames),
    ...(fetch ? { fetch } : {}),
  };
}
