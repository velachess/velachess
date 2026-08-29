import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

import { AppearanceScreen } from "../../../settings/appearance/appearance-screen.tsx";

export const Route = createFileRoute("/_app/settings/appearance")({
  staticData: { crumb: msg`Appearance` },
  component: AppearanceScreen,
});
