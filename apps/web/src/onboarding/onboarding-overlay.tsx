import { onboardingState } from "./onboarding-state.ts";
import { OnboardingDialog } from "./onboarding-dialog.tsx";
import { sessionQuery } from "../auth/session.ts";
import { syncJobQuery, trackedAccountsQuery } from "../games/import/queries.ts";
import { libraryQuery } from "../games/list/queries.ts";
import { useQueries, useQuery } from "../libs/react-query.ts";

/** Stays silent (renders null) while loading or on backend failure, so it never flashes or implies lost data. */
export function OnboardingOverlay() {
  const library = useQuery(libraryQuery({ page: 1 }));
  const accounts = useQuery(trackedAccountsQuery);
  // The same session query the app guard already runs, so this costs no
  // extra request — it only reads one more field off it.
  const session = useQuery(sessionQuery);
  // A sync the server still runs — a first import, or one from before a
  // reload — is followed until it settles, which refreshes the library.
  useQueries({
    queries: (accounts.data ?? []).flatMap((account) =>
      account.activeSyncId ? [syncJobQuery(account.activeSyncId)] : [],
    ),
  });

  const state = onboardingState({
    games: library.data?.total,
    accounts: accounts.data,
    onboarded: session.isPending ? undefined : (session.data?.onboarded ?? false),
    failed: library.isError || accounts.isError,
  });

  // Only two states are worth covering the app for: somebody who has
  // never been here, and a first sync still landing. `no-games` is
  // neither — a connected archive that came back empty, or a person who
  // onboarded long ago and has since disconnected everything. Both are
  // better served by the library's own empty state, which has a way out
  // of it; a modal with nothing behind it would be a dead end.
  if (state.kind !== "onboarding" && state.kind !== "syncing") return null;

  return <OnboardingDialog syncing={state.kind === "syncing"} />;
}
