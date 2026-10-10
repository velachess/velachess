import { onboardingState } from "./onboarding-state.ts";
import { OnboardingDialog } from "./onboarding-dialog.tsx";
import { trackedAccountsQuery } from "../games/import/queries.ts";
import { libraryQuery } from "../games/list/queries.ts";
import { useQuery } from "../libs/react-query.ts";

/** Stays silent (renders null) while loading or on backend failure, so it never flashes or implies lost data. */
export function OnboardingOverlay() {
  const library = useQuery(libraryQuery({ page: 1 }));
  const accounts = useQuery(trackedAccountsQuery);

  const state = onboardingState({
    games: library.data?.total,
    accounts: accounts.data,
    failed: library.isError || accounts.isError,
  });

  if (state.kind === "ready" || state.kind === "loading" || state.kind === "error") {
    return null;
  }

  return <OnboardingDialog syncing={state.kind === "syncing"} />;
}
