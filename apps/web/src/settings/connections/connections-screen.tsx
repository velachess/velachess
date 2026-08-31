import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Fragment } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@velachess/ui/components/item";
import { Separator } from "@velachess/ui/components/separator";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { Spinner } from "@velachess/ui/components/spinner";
import { toast } from "@velachess/ui/components/toast";
import { RefreshCw } from "@velachess/ui/icons";

import { ImportGames } from "../../games/import/import-games.tsx";
import {
  trackedAccountsQuery,
  useSyncGames,
  type SyncOutcome,
  type TrackedAccount,
} from "../../games/import/queries.ts";
import { IMPORT_SOURCES } from "../../games/import/sources.ts";
import { useQuery } from "../../libs/react-query.ts";

const CONNECTIONS_COPY = {
  title: msg`Connections`,
  description: msg`Manage the chess accounts VelaChess imports games from.`,
  loadError: msg`Couldn't load your connected accounts.`,
  neverSynced: msg`Not synced yet`,
  syncing: msg`Syncing…`,
  connect: msg`Connect an account`,
  sync: msg`Sync games`,
  running: msg`Syncing…`,
  upToDate: msg`Already up to date`,
  nothingNew: msg`No new games since your last sync.`,
  brought: msg`New games imported`,
  tooSoon: msg`Synced a moment ago`,
  failed: msg`Couldn't reach that account`,
  retry: msg`Try again in a moment.`,
} as const;

const retryIn = msg`{seconds, plural, one {Try again in # second.} other {Try again in # seconds.}}`;

/** Settings → Connections: the chess accounts games come from — not sign-in
 * methods (see Account). Composes the existing tracked-accounts query and
 * sync/import mutations; no account state lives here. */
export function ConnectionsScreen() {
  const { i18n } = useLingui();
  const accounts = useQuery(trackedAccountsQuery);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">{i18n._(CONNECTIONS_COPY.title)}</h2>
        <p className="text-sm text-muted-foreground">
          {i18n._(CONNECTIONS_COPY.description)}
        </p>
      </div>

      {accounts.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : accounts.isError ? (
        <p className="text-sm text-muted-foreground">
          {i18n._(CONNECTIONS_COPY.loadError)}
        </p>
      ) : accounts.data.length > 0 ? (
        <ItemGroup className="rounded-lg border">
          {accounts.data.map((account, index) => (
            <Fragment key={account.id}>
              <AccountRow account={account} />
              {index < accounts.data.length - 1 && <ItemSeparator />}
            </Fragment>
          ))}
        </ItemGroup>
      ) : null}

      <Separator />

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-medium">{i18n._(CONNECTIONS_COPY.connect)}</h3>
        <ImportGames chrome="bare" redirectTo="/settings/connections" />
      </section>
    </div>
  );
}

function AccountRow({ account }: { account: TrackedAccount }) {
  const { i18n } = useLingui();
  const Icon = IMPORT_SOURCES[account.platform].icon;

  const sync = useSyncGames({
    onOutcome: (outcome: SyncOutcome) => {
      if (outcome.status === "too-soon") {
        toast.add({
          type: "info",
          title: i18n._(CONNECTIONS_COPY.tooSoon),
          description: i18n._({
            ...retryIn,
            values: { seconds: outcome.retryAfterSeconds },
          }),
        });
        return;
      }

      if (outcome.saved === 0) {
        toast.add({
          type: "success",
          title: i18n._(CONNECTIONS_COPY.upToDate),
          description: i18n._(CONNECTIONS_COPY.nothingNew),
        });
        return;
      }

      toast.add({
        type: "success",
        title: i18n._(CONNECTIONS_COPY.brought),
        description: i18n.number(outcome.saved),
      });
    },
    onError: () => {
      toast.add({
        type: "error",
        title: i18n._(CONNECTIONS_COPY.failed),
        description: i18n._(CONNECTIONS_COPY.retry),
      });
    },
  });

  const label = sync.isPending ? CONNECTIONS_COPY.running : CONNECTIONS_COPY.sync;

  return (
    <Item>
      <ItemMedia>
        <Icon className="size-5" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{account.username}</ItemTitle>
        <ItemDescription>
          {account.lastSyncedAt
            ? i18n.date(new Date(account.lastSyncedAt), { dateStyle: "medium" })
            : i18n._(CONNECTIONS_COPY.neverSynced)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="ghost"
          size="icon"
          aria-label={i18n._(label)}
          onClick={() => sync.mutate([account])}
          disabled={sync.isPending}
        >
          {sync.isPending ? <Spinner aria-hidden="true" /> : <RefreshCw />}
        </Button>
      </ItemActions>
    </Item>
  );
}
