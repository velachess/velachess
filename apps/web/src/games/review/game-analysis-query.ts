/**
 * The analysis of one game, as React Query sees it: a stream of events
 * from `games/analysis` folded into one accumulating reading. The cache
 * is the accumulator — `experimental_streamedQuery` writes every chunk
 * through `setQueryData` — and each consumer subscribes with the
 * `select` that names what it draws.
 *
 * Leaving the screen does not stop the pass: `streamFn` never reads
 * `context.signal`, and React Query only cancels an observer-less fetch
 * whose signal was consumed. So the pass runs to its end, keeps filling
 * this cache and persists its report — and `cancelQueries()` is not an
 * interrupt here, which it must never be offered as.
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

/** Which game it is, and the replay it grades — all an analysis reads. */
export type AnalysedGame = Pick<ReplayableGame, "id"> & ReplayedGame;

const EMPTY_ANALYSIS: GameAnalysis = { graded: [], live: null, isComplete: false };

/** A provisional reading is replaced, never kept, and cleared by the
 * grade it was working toward. */
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
    // The identity of the answer, not just of the game: the stored
    // report is gated on the same three values.
    queryKey: [...gameAnalysisQueryKey, game.id, ANALYSIS_IDENTITY],
    queryFn: experimental_streamedQuery({
      streamFn: () => analyzeGameInBrowser({ gameId: game.id, replay: game }),
      reducer: reduceAnalysis,
      initialValue: EMPTY_ANALYSIS,
    }),
    // Stockfish runs on this device: an offline browser has no reason to
    // pause a search, and React Query would otherwise never start one.
    networkMode: "always",
    // One pass per game, shared by every consumer and by a remount.
    staleTime: Infinity,
    // Not a request. A failing search is a local engine failure, which
    // `query/query-client.ts` reports as such instead of as an API error.
    meta: { engine: true },
  });
}

export function selectGraded(analysis: GameAnalysis): readonly GradedPly[] {
  return analysis.graded;
}

/** The move just played, and the choice facing whoever is to move. */
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
  /** The search in flight, absent between positions and once done. */
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
