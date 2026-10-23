/**
 * The cache is the accumulator. Leaving the screen does not stop the pass:
 * `streamFn` never reads `context.signal`, and React Query only cancels an
 * observer-less fetch whose signal was consumed, so `cancelQueries()` is no
 * interrupt here.
 */
import {
  analyzeGameInBrowser,
  ANALYSIS_EVENT,
  ANALYSIS_IDENTITY,
  type AnalysisEvent,
  type GameAnalysis,
  type GradedPly,
} from "../analysis/index.ts";
import { experimental_streamedQuery, queryOptions } from "../../libs/react-query.ts";
import { gameAnalysisQueryKey } from "../game-query-keys.ts";

import type { ReplayedGame } from "@velachess/chess";

import type { ReplayableGame } from "./game-record.ts";
import { gradeAtPly } from "./review-model.ts";

export type AnalysedGame = Pick<ReplayableGame, "id"> & ReplayedGame;

const EMPTY_ANALYSIS: GameAnalysis = { graded: [], live: null, isComplete: false };

function reduceAnalysis(analysis: GameAnalysis, event: AnalysisEvent): GameAnalysis {
  if (event.type === ANALYSIS_EVENT.POSITION_UPDATE) {
    return { ...analysis, live: event.live };
  }

  if (event.type === ANALYSIS_EVENT.PLY_GRADED) {
    return {
      graded: [...analysis.graded, event.grade],
      live: null,
      isComplete: false,
    };
  }

  return { graded: event.graded, live: null, isComplete: true };
}

export function gameAnalysisQuery(game: AnalysedGame) {
  return queryOptions({
    // The identity of the answer, not just the game: the stored report is
    // gated on the same values.
    queryKey: [...gameAnalysisQueryKey, game.id, ANALYSIS_IDENTITY],
    queryFn: experimental_streamedQuery({
      streamFn: () => analyzeGameInBrowser({ gameId: game.id, replay: game }),
      reducer: reduceAnalysis,
      initialValue: EMPTY_ANALYSIS,
    }),
    // Stockfish runs on this device, so an offline browser must not pause
    // it.
    networkMode: "always",
    // One pass per game, shared by every consumer and by a remount.
    staleTime: Infinity,
    // Keeps a failed search out of the API error path; see
    // `query/query-client.ts`.
    meta: { engine: true },
  });
}

export function selectGraded(analysis: GameAnalysis): readonly GradedPly[] {
  return analysis.graded;
}

export interface BoardGrades {
  played: GradedPly | undefined;
  position: GradedPly | undefined;
}

export function boardGradesAtPly(ply: number) {
  return (analysis: GameAnalysis): BoardGrades => ({
    played: gradeAtPly(analysis.graded, ply),
    position: gradeAtPly(analysis.graded, ply + 1),
  });
}

export interface ProgressReading {
  graded: number;
  searching: { ply: number; depth: number } | null;
}

export function selectProgress(analysis: GameAnalysis): ProgressReading {
  return {
    graded: analysis.graded.length,
    searching: analysis.live
      ? { ply: analysis.live.ply, depth: analysis.live.update.depth }
      : null,
  };
}
