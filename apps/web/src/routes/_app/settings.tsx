import { msg } from "@lingui/core/macro";
import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Settings is a section, not a screen — a real ancestor so the crumb
 * resolves and so the next section (Connections) nests rather than
 * re-declares the level.
 */
export const Route = createFileRoute("/_app/settings")({
  staticData: { crumb: msg`Settings` },
  component: () => <Outlet />,
});
