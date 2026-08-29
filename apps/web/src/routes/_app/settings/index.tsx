import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/settings` has nothing of its own to show while Account is the only
 * section. A landing page listing one link would be a menu with one item.
 */
export const Route = createFileRoute("/_app/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/account", replace: true });
  },
});
