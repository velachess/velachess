import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Button } from "@velachess/ui/components/button";
import { Spinner } from "@velachess/ui/components/spinner";
import { toast } from "@velachess/ui/components/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@velachess/ui/components/tooltip";
import { RefreshCw } from "@velachess/ui/icons";

import { useQuery } from "../../../libs/react-query.ts";
import { isSyncInProgress, trackedAccountsQuery, useSyncGames } from "./queries.ts";
import { useSyncSettlementToast } from "./use-sync-settlement-toast.ts";

const SYNC_COPY = {
  action: msg`Sync games`,
  running: msg`Syncing…`,
  hint: msg`Fetch new games from your connected accounts`,
  tooSoon: msg`Synced a moment ago`,
  failed: msg`Couldn't sync your games`,
  retry: msg`Try again in a moment.`,
} as const;

// Parameterised, so it lives outside the const table the way other
// parameterised messages do. The wait is the one fact that makes this toast
// actionable — "a moment" invites an immediate retry; a number does not.
const retryIn = msg`{seconds, plural, one {Try again in # second.} other {Try again in # seconds.}}`;

export function SyncGamesButton() {
  const { i18n } = useLingui();
  const accounts = useQuery(trackedAccountsQuery).data ?? [];
  const { watch } = useSyncSettlementToast();

  const sync = useSyncGames({
    onTooSoon: (retryAfterSeconds) => {
      toast.add({
        id: "sync-games-too-soon",
        type: "info",
        title: i18n._(SYNC_COPY.tooSoon),
        description: i18n._({
          ...retryIn,
          values: { seconds: retryAfterSeconds },
        }),
      });
    },
    onError: () => {
      toast.add({
        id: "sync-games-failed",
        type: "error",
        title: i18n._(SYNC_COPY.failed),
        description: i18n._(SYNC_COPY.retry),
      });
    },
  });

  // Running means the server says so: the request in flight, or an account
  // whose job the worker still holds — a reload or another screen shows
  // the same thing, because none of it lives here.
  const syncing = isSyncInProgress(sync.isPending, accounts);
  const label = syncing ? SYNC_COPY.running : SYNC_COPY.action;

  const handleSync = () => {
    sync.mutate(undefined, { onSuccess: (data) => watch(data.syncIds) });
  };

  // Labelled, not an icon alone: this asks the providers for new games
  // rather than refetching what the list already has.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncing || accounts.length === 0}
          >
            <SyncIcon isPending={syncing} />
            {i18n._(label)}
          </Button>
        }
      />
      <TooltipContent>{i18n._(SYNC_COPY.hint)}</TooltipContent>
    </Tooltip>
  );
}

function SyncIcon({ isPending }: { isPending: boolean }) {
  if (isPending) return <Spinner data-icon="inline-start" aria-hidden="true" />;
  return <RefreshCw data-icon="inline-start" />;
}
