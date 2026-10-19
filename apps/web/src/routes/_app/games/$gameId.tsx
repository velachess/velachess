import { createFileRoute } from "@tanstack/react-router";

import { GameReview } from "../../../games/review/index.ts";

export const Route = createFileRoute("/_app/games/$gameId")({
  component: GameReview,
});
