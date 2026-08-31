/**
 * Composition root for the analysis module: adapts the DB client and
 * queue every route already carries into the narrow readers/writers each
 * analysis route's slice declared. Routes never see a Database or
 * AnalysisQueue value directly.
 *
 * `request-analysis` is this module's own shared primitive: get-analysis
 * and watch-analysis both declare their own dependency on it, wired here
 * to the same real handler — the way games/land-new-games is wired for
 * its module-mate import-pgn in `./games.ts`.
 */
import {
  countProgress,
  getAnalysis,
  getGame,
  getGameForUser,
  listEngineDrillCandidates,
  listProgress,
  userIdForGame,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import { seedsFor } from "@velachess/drills";
import {
  requestAnalysis as requestAnalysisSlice,
  requestAnalysisForUser as requestAnalysisForUserSlice,
} from "@velachess/analysis";
import type {
  DrillSummaryDeps,
  GetAnalysisDeps,
  RequestAnalysisDeps,
  WatcherDeps,
  WatchTerminal,
} from "@velachess/analysis";
import type { AnalysisQueue } from "@velachess/infra-queue";

export function buildRequestAnalysisDeps(
  db: Database,
  analysisQueue: AnalysisQueue,
): RequestAnalysisDeps {
  return {
    getGame: (gameId) => getGame(db, gameId),
    getGameForUser: (userId, gameId) => getGameForUser(db, userId, gameId),
    getAnalysis: (gameId) => getAnalysis(db, gameId),
    getQueueState: (gameId) => analysisQueue.getState(gameId),
    enqueueAnalysis: (gameId) => analysisQueue.enqueue(db, gameId),
  };
}

export function buildDrillSummaryDeps(db: Database): DrillSummaryDeps {
  return {
    userIdForGame: (gameId) => userIdForGame(db, gameId),
    listEngineDrillCandidates: (userId, scope) =>
      listEngineDrillCandidates(db, userId, scope),
    seedsFor,
  };
}

export function buildGetAnalysisDeps(
  db: Database,
  analysisQueue: AnalysisQueue,
): GetAnalysisDeps {
  const requestAnalysisDeps = buildRequestAnalysisDeps(db, analysisQueue);
  return {
    ...buildDrillSummaryDeps(db),
    requestAnalysisForUser: (userId, gameId) =>
      requestAnalysisForUserSlice(requestAnalysisDeps, userId, gameId),
    countProgress: (gameId) => countProgress(db, gameId),
  };
}

/**
 * Exported for `apps/server/src/main.ts` (and `apps/server/tests/
 * harness.ts`'s twin construction) to build the one shared `Watchers`
 * instance — `createWatchers` itself lives in `@velachess/analysis`.
 */
export function buildWatcherDeps(
  db: Database,
  analysisQueue: AnalysisQueue,
  intervalMs?: number,
): WatcherDeps {
  const requestAnalysisDeps = buildRequestAnalysisDeps(db, analysisQueue);
  return {
    listProgress: (gameId) => listProgress(db, gameId),
    requestAnalysis: async (gameId): Promise<WatchTerminal> => {
      const result = await requestAnalysisSlice(requestAnalysisDeps, gameId);
      return result.status === "completed"
        ? { status: "completed", analysis: { positions: result.analysis.positions } }
        : result;
    },
    ...(intervalMs !== undefined ? { intervalMs } : {}),
  };
}
