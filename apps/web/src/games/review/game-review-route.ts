/**
 * Opening a game is the engine's one product trigger, so it is the route
 * that pulls it — not a component, which would mean an effect firing
 * after the screen already rendered.
 */
import { createClientOnlyFn } from "@tanstack/react-start";

import type { QueryClientType } from "../../libs/react-query.ts";
import { gameAnalysisQuery } from "./game-analysis-query.ts";
import { gameQuery, type ReplayableGame } from "./game-record.ts";

/**
 * Stockfish is a Web Worker, and a loader runs on the server too. The
 * body is dropped from the server bundle rather than guarded at runtime,
 * so there is nothing to keep two copies of in sync.
 *
 * `prefetchQuery` rather than `ensureQueryData`: it never rejects, so an
 * engine this browser cannot run fails the analysis and not the
 * navigation. The screen reads the same query and is what says so.
 */
const analyzeInBrowser = createClientOnlyFn(
  (queryClient: QueryClientType, game: ReplayableGame) => {
    void queryClient.prefetchQuery(gameAnalysisQuery(game));
  },
);

export async function loadGameReview(
  queryClient: QueryClientType,
  gameId: string,
): Promise<void> {
  // Awaited because the replay has to be in hand before the engine can
  // be pointed at it — this query is the one interpretation of the PGN,
  // and the pass below reads it rather than parsing again; swallowed because the screen reads this same query
  // and is what tells a person their game could not be read, rather than
  // the router's error boundary replacing the review with a generic
  // failure.
  const game = await queryClient.ensureQueryData(gameQuery(gameId)).catch(() => null);
  if (!game) return;

  // Nothing is awaited past here: the grading outlives the navigation
  // that started it, and must never hold one open. Everything else about
  // the pass is the query's — it picks up one already under way, and
  // keeps going once this screen is gone.
  analyzeInBrowser(queryClient, game);
}
