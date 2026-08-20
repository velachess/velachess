import { dashboardState } from "./dashboard-state.ts";
import { OnboardingDialog } from "./onboarding-dialog.tsx";
import { overviewQuery } from "../dashboard/queries.ts";
import { trackedAccountsQuery } from "../games/import/queries.ts";
import { useQuery } from "../shared/libs/query/index.ts";

/** Stays silent (renders null) while loading or on backend failure, so it never flashes or implies lost data. */
export function OnboardingOverlay() {
  const overview = useQuery(overviewQuery);
  const accounts = useQuery(trackedAccountsQuery);

  const state = dashboardState({
    overview: overview.data,
    accounts: accounts.data,
    failed: overview.isError || accounts.isError,
  });

  if (state.kind === "ready" || state.kind === "loading" || state.kind === "error") {
    return null;
  }

  return <OnboardingDialog syncing={state.kind === "syncing"} />;
}
