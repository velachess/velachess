import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

import { SettingsLayout } from "../../settings/layout/settings-layout.tsx";

/**
 * Settings is a section, not a screen — a real ancestor so the crumb
 * resolves, and it owns the shell (heading + nav) every child section
 * renders inside of.
 */
export const Route = createFileRoute("/_app/settings")({
  staticData: { crumb: msg`Settings` },
  component: SettingsLayout,
});
