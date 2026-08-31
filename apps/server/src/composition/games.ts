/**
 * Composition root for the games module: adapts the DB client and queue
 * every route already carries into the narrow readers/writers each games
 * route's slice declared. Routes never see a Database or AnalysisQueue
 * value directly. One builder per route (get-game, list-games,
 * import-pgn, judge-games), plus `buildLandNewGamesDeps`, which composes
 * `land-new-games`'s own three dependencies from repertoires'/drills'/
 * games' apis — the same way `import-pgn`'s `landNewGames` field and
 * `accounts/sync-account` (not yet migrated) both end up calling the
 * same real games/land-new-games handler.
 */
import { seedRepertoireLines, triageAndSeed } from "@velachess/drills";
import {
  applyEngineSignal,
  findProviderProfiles,
  getAnalysis,
  getGameForUser,
  getRepertoireWithChapters,
  isProfileFresh,
  listGamesPage,
  listRepertoiresByUser,
  listUnjudgedGames,
  saveGames,
  upsertJudgment,
  upsertProviderProfile,
  upsertUnmatchedJudgment,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import {
  judgeGamesForUser as judgeGamesForUserSlice,
  landNewGames as landNewGamesSlice,
} from "@velachess/games";
import type {
  GetGameDeps,
  ImportPgnDeps,
  JudgeGamesDeps,
  LandNewGamesDeps,
  ListGamesDeps,
} from "@velachess/games";
import type { FetchFn } from "@velachess/infra-platforms";
import type { AnalysisQueue } from "@velachess/infra-queue";
import { ensureCandidateRepertoires } from "@velachess/repertoires";

export function buildGetGameDeps(db: Database, fetch?: FetchFn): GetGameDeps {
  return {
    getGameForUser: (userId, gameId) => getGameForUser(db, userId, gameId),
    findProviderProfiles: (seats) => findProviderProfiles(db, seats),
    upsertProviderProfile: (seat, fetched) => upsertProviderProfile(db, seat, fetched),
    isProfileFresh,
    ...(fetch ? { fetch } : {}),
  };
}

export function buildListGamesDeps(db: Database): ListGamesDeps {
  return {
    listGamesPage: (userId, filters, page) => listGamesPage(db, userId, filters, page),
  };
}

export function buildJudgeGamesDeps(
  db: Database,
  analysisQueue: AnalysisQueue,
): JudgeGamesDeps {
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

/**
 * Exported for `apps/server/src/composition/accounts.ts` too:
 * `accounts/sync-account` needs the same real `land-new-games` handler
 * `import-pgn`'s own composition (below) wires up, sourced from
 * `@velachess/games`'s own `index.ts`.
 */
export function buildLandNewGamesDeps(
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

export function buildImportPgnDeps(
  db: Database,
  analysisQueue: AnalysisQueue,
): ImportPgnDeps {
  const landNewGamesDeps = buildLandNewGamesDeps(db, analysisQueue);
  return {
    saveGames: (games, userId) => saveGames(db, games, { userId }),
    landNewGames: (userId, newGames) =>
      landNewGamesSlice(landNewGamesDeps, userId, newGames),
  };
}
