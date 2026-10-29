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
import {
  isSyncActive,
  SYNC_RETRY_IN,
  trackedAccountsQuery,
  useSyncGames,
} from "./queries.ts";

const SYNC_COPY = {
  action: msg`Sync games`,
  running: msg`Syncing…`,
  hint: msg`Fetch new games from your connected accounts`,
  tooSoon: msg`Synced a moment ago`,
  failed: msg`Couldn't sync your games`,
  retry: msg`Try again in a moment.`,
} as const;

export function SyncGamesButton() {
  const { i18n } = useLingui();
  const accounts = useQuery(trackedAccountsQuery).data ?? [];

  const sync = useSyncGames({
    onTooSoon: (retryAfterSeconds) => {
      toast.add({
        id: "sync-games-too-soon",
        type: "info",
        title: i18n._(SYNC_COPY.tooSoon),
        description:
          retryAfterSeconds === null
            ? i18n._(SYNC_COPY.retry)
            : i18n._({ ...SYNC_RETRY_IN, values: { seconds: retryAfterSeconds } }),
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

  const syncing =
    sync.isPending || accounts.some((account) => isSyncActive(account.syncStatus));
  const label = syncing ? SYNC_COPY.running : SYNC_COPY.action;

  // Labelled, not an icon alone: this asks the providers for new games
  // rather than refetching what the list already has.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            onClick={() => sync.mutate()}
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
