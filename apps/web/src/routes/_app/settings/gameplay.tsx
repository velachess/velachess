import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

import { GameplayScreen } from "../../../settings/gameplay/gameplay-screen.tsx";

export const Route = createFileRoute("/_app/settings/gameplay")({
  staticData: { crumb: msg`Gameplay` },
  component: GameplayScreen,
});
