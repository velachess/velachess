/**
 * The hook `game-analysis.tsx` calls to drive the review screen's
 * analysis. Single execution path: Stockfish WASM in the browser — no
 * server fallback. An init or run failure surfaces as a recoverable
 * error state; it never calls the backend.
 *
 * React Query owns the run: `experimental_streamedQuery` appends each
 * streamed `GradedPly` into the query's cached array as it arrives,
 * `staleTime: Infinity` means a finished analysis is never re-run while
 * this query stays in the cache, and `retry: false` because a failed
 * engine run isn't worth re-attempting automatically.
 *
 * No explicit cancel-on-unmount: an in-flight run is left to finish in
 * the background rather than stopped when the screen is left early.
 */
import { gameQuery } from "../analysis-contract.ts";
import type { GradedPly, ReplayableGame } from "../analysis-contract.ts";
import {
  experimental_streamedQuery as streamedQuery,
  useQuery,
} from "../../libs/react-query.ts";
import {
  useChessReplay,
  type ChessReplay,
  type ReplayNavigation,
} from "../open-game/use-chess-replay.ts";

import { analyzeGameInBrowser } from "./analyze-game-in-browser.ts";

function browserAnalysisKey(gameId: string) {
  return ["browser-analysis", gameId] as const;
}

export interface BrowserAnalysis {
  game: ReplayableGame | undefined;
  isLoading: boolean;
  hasFailed: boolean;
  replay: ChessReplay;
  graded: GradedPly[];
  isAnalyzing: boolean;
  analysisFailed: boolean;
}

export function useBrowserAnalysis(
  gameId: string,
  onReplayNavigate?: ReplayNavigation,
): BrowserAnalysis {
  const game = useQuery(gameQuery(gameId));
  const rawPgn = game.data?.rawPgn;

  const analysis = useQuery({
    queryKey: browserAnalysisKey(gameId),
    queryFn: streamedQuery({
      streamFn: ({ signal }) => analyzeGameInBrowser(rawPgn ?? "", 14, signal),
      refetchMode: "replace",
    }),
    enabled: rawPgn !== undefined,
    retry: false,
    staleTime: Infinity,
  });

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
    graded: analysis.data ?? [],
    isAnalyzing: analysis.isFetching,
    analysisFailed: analysis.isError,
  };
}
