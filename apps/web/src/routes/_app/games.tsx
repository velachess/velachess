import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/games")({
  component: () => <Outlet />,
});
