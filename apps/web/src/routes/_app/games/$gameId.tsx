import { createFileRoute } from "@tanstack/react-router";

import { GameReview, loadGameReview } from "../../../games/review/index.ts";

export const Route = createFileRoute("/_app/games/$gameId")({
  // Opening a game is what starts its analysis, so the route is what
  // triggers it — before the screen exists, not from inside it.
  loader: ({ context, params }) => loadGameReview(context.queryClient, params.gameId),
  component: GameReview,
});
