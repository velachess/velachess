/**
 * Opening a game is the engine's one product trigger, so it is the route
 * that pulls it — not a component, which would mean an effect firing
 * after the screen already rendered.
 */
import { createClientOnlyFn } from "@tanstack/react-start";

import { ANALYSIS_DEPTH, startAnalysis } from "../analysis/index.ts";
import type { QueryClientType } from "../../libs/react-query.ts";
import { gameQuery, type ReplayableGame } from "./game-record.ts";

/**
 * Stockfish is a Web Worker, and a loader runs on the server too. The
 * body is dropped from the server bundle rather than guarded at runtime,
 * so there is nothing to keep two copies of in sync.
 */
const analyzeInBrowser = createClientOnlyFn((game: ReplayableGame) => {
  startAnalysis({ gameId: game.id, rawPgn: game.rawPgn, depth: ANALYSIS_DEPTH });
});

export async function loadGameReview(
  queryClient: QueryClientType,
  gameId: string,
): Promise<void> {
  // Awaited because the movetext has to be in hand before the engine can
  // be pointed at it; swallowed because the screen reads this same query
  // and is what tells a person their game could not be read, rather than
  // the router's error boundary replacing the review with a generic
  // failure.
  const game = await queryClient.ensureQueryData(gameQuery(gameId)).catch(() => null);
  if (!game) return;

  // Nothing is awaited past here: the grading outlives the navigation
  // that started it, and must never hold one open. Everything else about
  // the pass is `startAnalysis`'s — it picks up one already under way,
  // replaces it when a different game is opened, and keeps going once
  // this screen is gone.
  analyzeInBrowser(game);
}
