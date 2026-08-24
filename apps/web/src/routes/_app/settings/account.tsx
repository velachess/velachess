import { msg } from "@lingui/core/macro";
import { createFileRoute } from "@tanstack/react-router";

import { AccountScreen } from "../../../settings/account/account-screen.tsx";

export const Route = createFileRoute("/_app/settings/account")({
  staticData: { crumb: msg`Account` },
  component: AccountScreen,
});
