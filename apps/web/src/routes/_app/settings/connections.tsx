import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsScreen } from "../../../settings/connections/connections-screen.tsx";

export const Route = createFileRoute("/_app/settings/connections")({
  component: ConnectionsScreen,
});
