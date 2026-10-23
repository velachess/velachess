import { onboardingState } from "./onboarding-state.ts";
import { OnboardingDialog } from "./onboarding-dialog.tsx";
import { sessionQuery } from "../auth/session.ts";
import { trackedAccountsQuery } from "../games/import/index.ts";
import { libraryQuery } from "../games/list/index.ts";
import { useQuery } from "../libs/react-query.ts";

/** Silent while loading or on a backend failure, so it never flashes or
 * implies lost data. */
export function OnboardingOverlay() {
  const library = useQuery(libraryQuery({ page: 1 }));
  const accounts = useQuery(trackedAccountsQuery);
  // The session query the app guard already runs, so this costs no extra
  // request. A sync the server still runs shows on the accounts, which the
  // sync stream refreshes when it lands.
  const session = useQuery(sessionQuery);

  const state = onboardingState({
    games: library.data?.total,
    accounts: accounts.data,
    onboarded: session.isPending ? undefined : (session.data?.onboarded ?? false),
    failed: library.isError || accounts.isError,
  });

  // Only somebody who has never been here and a first sync still landing
  // are worth covering the app for. `no-games` is an empty archive or
  // someone who disconnected everything, both better served by the
  // library's own empty state, which has a way out.
  if (state.kind !== "onboarding" && state.kind !== "syncing") return null;

  return <OnboardingDialog syncing={state.kind === "syncing"} />;
}
