import { createFileRoute } from "@tanstack/react-router";

import { GamesList } from "../../../games/games-list.tsx";
import { gamesSearchSchema } from "../../../games/list/filters.ts";

export const Route = createFileRoute("/_app/games/")({
  // `.catch()` on every field means a hand-typed `?outcome=banana` falls
  // back instead of crashing the route.
  validateSearch: gamesSearchSchema,
  component: GamesList,
});
