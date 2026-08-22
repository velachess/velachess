import { useEffect } from "react";

import { useQuery, useQueryClient } from "../../shared/libs/query/index.ts";
import {
  analysisKey,
  analysisQuery,
  drillCountQuery,
  gameQuery,
} from "../analysis-contract.ts";
import type { DrillCount, GradedPly, ReplayableGame } from "../analysis-contract.ts";
import {
  useChessReplay,
  type ChessReplay,
  type ReplayNavigation,
} from "../open-game/use-chess-replay.ts";

export interface Analysis {
  game: ReplayableGame | undefined;
  /** The game itself is still loading — the only true empty state here. */
  isLoading: boolean;
  hasFailed: boolean;
  isRetryingGame: boolean;
  retryGame: () => void;
  /** Stepping through the moves. Empty and valid until the game lands. */
  replay: ChessReplay;
  /** Graded moves so far, in ply order. Grows while the run streams. */
  graded: GradedPly[];
  /** What the report's drill CTA counts. Absent until analysis lands. */
  drills: DrillCount | undefined;
  /** The run is open. `isFetching`, never `isPending`: `streamedQuery` writes each chunk via `setQueryData`, so success fires after the first graded move. */
  isAnalyzing: boolean;
  analysisFailed: boolean;
}

export function useAnalysis(
  gameId: string,
  onReplayNavigate?: ReplayNavigation,
): Analysis {
  const game = useQuery(gameQuery(gameId));
  const analysis = useQuery(analysisQuery(gameId));
  // Only once the run has finished: asking while the stream is open
  // races it for the same endpoint, and the answer would count a report
  // that is still being written.
  const drills = useQuery({
    ...drillCountQuery(gameId),
    enabled: analysis.isSuccess && !analysis.isFetching,
  });
  const queryClient = useQueryClient();

  // React Query keeps an in-flight query running after its last observer unmounts, so leaving mid-run held the connection open; cancelling aborts the stream's signal.
  // Untested: MSW never settles a reader cancel, so this can't be observed here — worth an e2e when there is one.
  useEffect(() => {
    return () => {
      void queryClient.cancelQueries({ queryKey: analysisKey(gameId) });
    };
  }, [queryClient, gameId]);

  // Called unconditionally, before any caller's early return: hooks do
  // not take branches, and an empty replay is a valid one.
  const replay = useChessReplay(
    game.data?.moves ?? [],
    game.data?.startFen ?? "",
    onReplayNavigate,
  );

  return {
    game: game.data,
    isLoading: game.isPending,
    hasFailed: game.isError,
    isRetryingGame: game.isFetching,
    retryGame: () => void game.refetch(),
    replay,
    graded: analysis.data ?? [],
    drills: drills.data ?? undefined,
    isAnalyzing: analysis.isFetching,
    analysisFailed: analysis.isError,
  };
}
