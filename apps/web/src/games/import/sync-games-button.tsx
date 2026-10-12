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

import { useQuery } from "../../libs/react-query.ts";
import { isSyncInProgress, trackedAccountsQuery, useSyncGames } from "./queries.ts";
import { useSyncSettlementToast } from "./use-sync-settlement-toast.ts";

const SYNC_COPY = {
  action: msg`Sync games`,
  running: msg`Syncing…`,
  failed: msg`Couldn't sync your games`,
  retry: msg`Try again in a moment.`,
} as const;

export function SyncGamesButton() {
  const { i18n } = useLingui();
  const accounts = useQuery(trackedAccountsQuery).data ?? [];
  const { watch } = useSyncSettlementToast();

  const sync = useSyncGames({
    onError: () => {
      toast.add({
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

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={i18n._(label)}
            onClick={handleSync}
            disabled={syncing || accounts.length === 0}
          >
            <SyncIcon isPending={syncing} />
          </Button>
        }
      />
      <TooltipContent>{i18n._(label)}</TooltipContent>
    </Tooltip>
  );
}

function SyncIcon({ isPending }: { isPending: boolean }) {
  if (isPending) return <Spinner aria-hidden="true" />;
  return <RefreshCw />;
}
