import { msg } from "@lingui/core/macro";
import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Real nesting (not the `games_` sibling trick) so `useBreadcrumbTrail` can find this route's `staticData`. */
export const Route = createFileRoute("/_app/games")({
  staticData: { crumb: msg`Games` },
  component: () => <Outlet />,
});
