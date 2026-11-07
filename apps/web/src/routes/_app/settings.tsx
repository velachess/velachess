import { createFileRoute } from "@tanstack/react-router";

import { SettingsLayout } from "../../settings/layout/settings-layout.tsx";

/**
 * Settings is a section, not a screen — it owns the shell (heading + nav)
 * every child section renders inside of.
 */
export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
});
