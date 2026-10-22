/**
 * The analysis of one game, as React Query sees it: a stream of events
 * from `games/analysis` folded into one accumulating reading.
 *
 * The cache is the accumulator — `experimental_streamedQuery` writes
 * every chunk through `setQueryData`, so progress belongs to the query
 * and not to a store beside it. Each consumer subscribes with the
 * `select` that names what it draws, which is what keeps a graded ply
 * from re-rendering the board and a deepening search from re-rendering
 * the scoresheet.
 *
 * Leaving the screen does not stop the pass: `streamFn` never reads
 * `context.signal`, and React Query only cancels an observer-less fetch
 * whose signal was consumed. The pass therefore runs to its end, keeps
 * filling this cache, and persists its report — which also means
 * `cancelQueries()` is not an interrupt here and must never be offered as
 * one. The Worker is released when the stream ends, in `analyze.ts`.
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

/**
 * What an analysis needs of a game: which game it is, and the replay it
 * grades. Narrower than `ReplayableGame` because nothing here reads a
 * player, a rating or a result — and a test can then build one without
 * inventing the rest of an HTTP payload.
 */
export type AnalysedGame = Pick<ReplayableGame, "id"> & ReplayedGame;

const EMPTY_ANALYSIS: GameAnalysis = { graded: [], live: null, isComplete: false };

/**
 * A provisional reading is replaced, never kept: `live` is one search's
 * current depth, and it is cleared the moment that search produces a
 * grade, so it can never be read as belonging to the next position.
 */
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
    // The identity of the answer, not just of the game: a report graded
    // by another engine build, depth or policy is a different report,
    // and the stored one is gated on the same three values.
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

/** What the board draws of the report: the move just played, and the
 * choice facing whoever is to move now. */
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
