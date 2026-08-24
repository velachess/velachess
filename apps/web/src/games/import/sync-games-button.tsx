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

import { useQuery } from "../../shared/libs/query/index.ts";
import { trackedAccountsQuery, useSyncGames } from "./queries.ts";

const SYNC_COPY = {
  action: msg`Sync games`,
  running: msg`Syncing…`,
  upToDate: msg`Already up to date`,
  nothingNew: msg`No new games since your last sync.`,
  brought: msg`New games imported`,
  tooSoon: msg`Synced a moment ago`,
  failed: msg`Couldn't reach that account`,
  retry: msg`Try again in a moment.`,
} as const;

// Parameterised, so it lives outside the const table the way the insights
// coverage line does. The wait is the one fact that makes this toast
// actionable — "a moment" invites an immediate retry; a number does not.
const retryIn = msg`Try again in {seconds} seconds.`;

export function SyncGamesButton() {
  const { i18n } = useLingui();
  const accounts = useQuery(trackedAccountsQuery).data ?? [];

  const sync = useSyncGames({
    onOutcome: (outcome) => {
      if (outcome.status === "too-soon") {
        toast.add({
          type: "info",
          title: i18n._(SYNC_COPY.tooSoon),
          description: i18n._({
            ...retryIn,
            values: { seconds: i18n.number(outcome.retryAfterSeconds) },
          }),
        });
        return;
      }

      if (outcome.saved === 0) {
        toast.add({
          type: "success",
          title: i18n._(SYNC_COPY.upToDate),
          description: i18n._(SYNC_COPY.nothingNew),
        });
        return;
      }

      toast.add({
        type: "success",
        title: i18n._(SYNC_COPY.brought),
        description: i18n.number(outcome.saved),
      });
    },
    onError: () => {
      toast.add({
        type: "error",
        title: i18n._(SYNC_COPY.failed),
        description: i18n._(SYNC_COPY.retry),
      });
    },
  });

  const label = sync.isPending ? SYNC_COPY.running : SYNC_COPY.action;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={i18n._(label)}
            onClick={() => sync.mutate(accounts)}
            disabled={sync.isPending || accounts.length === 0}
          >
            <SyncIcon isPending={sync.isPending} />
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
