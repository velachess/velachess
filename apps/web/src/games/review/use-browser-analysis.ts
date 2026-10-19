/**
 * Drives the review screen's analysis: Stockfish WASM in the browser only,
 * no server fallback. The game itself still comes over HTTP through React
 * Query; the analysis does not, because it is computed here and its
 * progress belongs to the device rather than to a cache of server state.
 *
 * `AnalysisStore` holds that progress outside React and `startAnalysis`
 * owns its lifecycle, so opening a different game replaces the pass under
 * way while closing the *last* open game's screen lets it finish in the
 * background.
 */
import { useEffect } from "react";

import { startAnalysis, useEngineAnalysis, type GradedPly } from "../analysis/index.ts";
import { gameQuery, type ReplayableGame } from "./game-record.ts";
import { useQuery } from "../../libs/react-query.ts";
import {
  useChessReplay,
  type ChessReplay,
  type ReplayNavigation,
} from "./use-chess-replay.ts";

const ANALYSIS_DEPTH = 14;

export interface BrowserAnalysis {
  game: ReplayableGame | undefined;
  isLoading: boolean;
  hasFailed: boolean;
  replay: ChessReplay;
  graded: readonly GradedPly[];
  isAnalyzing: boolean;
  analysisFailed: boolean;
}

export function useBrowserAnalysis(
  gameId: string,
  onReplayNavigate?: ReplayNavigation,
): BrowserAnalysis {
  const game = useQuery(gameQuery(gameId));
  const rawPgn = game.data?.rawPgn;
  const analysis = useEngineAnalysis(gameId);

  // Whether an analysis is running is not something a render can derive,
  // and it has to outlive this screen — so this is the one effect here,
  // and deliberately without cleanup: leaving the screen is not a reason
  // to throw away the grading already paid for.
  useEffect(() => {
    if (rawPgn === undefined) return;
    startAnalysis({ gameId, rawPgn, depth: ANALYSIS_DEPTH });
  }, [gameId, rawPgn]);

  const replay = useChessReplay(
    game.data?.moves ?? [],
    game.data?.startFen ?? "",
    onReplayNavigate,
  );

  return {
    game: game.data,
    isLoading: game.isPending,
    hasFailed: game.isError,
    replay,
    graded: analysis.graded,
    isAnalyzing: analysis.status === "analyzing",
    analysisFailed: analysis.status === "error",
  };
}
