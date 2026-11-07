import { createFileRoute } from "@tanstack/react-router";

import { AppearanceScreen } from "../../../settings/appearance/appearance-screen.tsx";

export const Route = createFileRoute("/_app/settings/appearance")({
  component: AppearanceScreen,
});
