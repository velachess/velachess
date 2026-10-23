import { createClientOnlyFn } from "@tanstack/react-start";

import type { QueryClientType } from "../../libs/react-query.ts";
import { gameAnalysisQuery } from "./game-analysis-query.ts";
import { gameQuery, type ReplayableGame } from "./game-record.ts";

/** Stockfish is a Web Worker and a loader runs on the server too, so the
 * body is dropped from the server bundle rather than guarded at runtime. */
const analyzeInBrowser = createClientOnlyFn(
  (queryClient: QueryClientType, game: ReplayableGame) => {
    void queryClient.prefetchQuery(gameAnalysisQuery(game));
  },
);

export async function loadGameReview(
  queryClient: QueryClientType,
  gameId: string,
): Promise<void> {
  // Swallowed: the screen reads this same query and is what reports a
  // game it could not read, rather than the router's error boundary.
  const game = await queryClient.ensureQueryData(gameQuery(gameId)).catch(() => null);
  if (!game) return;

  // Never awaited: a grading must not hold a navigation open.
  analyzeInBrowser(queryClient, game);
}
