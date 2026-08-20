import { createFileRoute } from "@tanstack/react-router";

import { GameAnalysis } from "../../../games/open-game/game-analysis.tsx";

export const Route = createFileRoute("/_app/games/$gameId")({
  component: GameAnalysis,
});
