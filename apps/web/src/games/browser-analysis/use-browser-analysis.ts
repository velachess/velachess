/**
 * Drives the review screen's analysis: Stockfish WASM in the browser only,
 * no server fallback. `EngineManager` is the one Worker this app ever
 * runs — opening a different game cancels whatever the previous one was
 * doing rather than letting two games fight over it (or a stale result
 * leak into the game that's open now). There is still no cancel-on-close:
 * closing the *last* open game's screen, with nothing new to replace it,
 * lets that run finish in the background.
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

import { engineManager } from "./engine-manager.ts";

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
      streamFn: ({ signal }) => engineManager.runGame(rawPgn ?? "", 14, signal),
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
