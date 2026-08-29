import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsScreen } from "../../../settings/connections/connections-screen.tsx";

export const Route = createFileRoute("/_app/settings/connections")({
  staticData: { crumb: msg`Connections` },
  component: ConnectionsScreen,
});
