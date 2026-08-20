import { msg } from "@lingui/core/macro";
import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * The layout the landing, the book detail and the chapter study nest
 * under — a real ancestor so `useBreadcrumbTrail` finds the crumb.
 */
export const Route = createFileRoute("/_app/repertoire")({
  staticData: { crumb: msg`Repertoire` },
  component: () => <Outlet />,
});
