import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Fragment, useState } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@velachess/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@velachess/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@velachess/ui/components/empty";
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
import { MoreVertical, RefreshCw, Trash2 } from "@velachess/ui/icons";

import { GAME_SOURCES } from "../../games/game-sources.ts";
import {
  ConnectAccount,
  isSyncInProgress,
  trackedAccountsQuery,
  useDisconnectAccount,
  useSyncAccount,
  useSyncSettlementToast,
  type TrackedAccount,
} from "../../games/import/index.ts";
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
  tooSoon: msg`Synced a moment ago`,
  failed: msg`Couldn't reach that account`,
  retry: msg`Try again in a moment.`,
  moreActions: msg`More actions`,
  disconnect: msg`Disconnect`,
  disconnectTitle: msg`Remove connection?`,
  disconnectDescription: msg`Removing the connection to {username} on {platform} also deletes the games VelaChess imported from it, and their analyses. This can't be undone. Games you imported from a PGN file are not affected.`,
  cancel: msg`Cancel`,
  disconnectConfirm: msg`Remove connection`,
  disconnecting: msg`Removing…`,
  disconnectedTitle: msg`Connection removed`,
  disconnectFailedTitle: msg`Couldn't remove the connection`,
  disconnectFailedDescription: msg`Try again in a moment.`,
  emptyTitle: msg`No chess accounts connected`,
  emptyDescription: msg`Connect your Chess.com or Lichess handle below so VelaChess can import your games and review them with Stockfish.`,
} as const;

const retryIn = msg`{seconds, plural, one {Try again in # second.} other {Try again in # seconds.}}`;

const CONNECTIONS_VIEW_KIND = {
  LOADING: "loading",
  LOAD_ERROR: "load-error",
  EMPTY: "empty",
  CONNECTED: "connected",
} as const;

/** The screen's one branch point, named instead of re-checked inline —
 * mirrors `onboarding-state.ts`'s `onboardingState()`: sequential guards
 * producing a discriminated union, read once at the top of render. */
type ConnectionsView =
  | { kind: typeof CONNECTIONS_VIEW_KIND.LOADING }
  | { kind: typeof CONNECTIONS_VIEW_KIND.LOAD_ERROR }
  | { kind: typeof CONNECTIONS_VIEW_KIND.EMPTY }
  | { kind: typeof CONNECTIONS_VIEW_KIND.CONNECTED; accounts: TrackedAccount[] };

function connectionsView(
  isPending: boolean,
  isError: boolean,
  data: TrackedAccount[] | undefined,
): ConnectionsView {
  if (isPending) return { kind: CONNECTIONS_VIEW_KIND.LOADING };
  if (isError) return { kind: CONNECTIONS_VIEW_KIND.LOAD_ERROR };
  // Neither pending nor errored: the query succeeded, so `data` is defined
  // — react-query's own guarantee, same one the original ternary here
  // relied on implicitly.
  if (data!.length === 0) return { kind: CONNECTIONS_VIEW_KIND.EMPTY };
  return { kind: CONNECTIONS_VIEW_KIND.CONNECTED, accounts: data! };
}

/** Settings → Connections: the chess accounts games come from — not sign-in
 * methods (see Account). Composes the existing tracked-accounts query and
 * sync/import mutations; no account state lives here. */
export function ConnectionsScreen() {
  const { i18n } = useLingui();
  const accounts = useQuery(trackedAccountsQuery);
  const view = connectionsView(accounts.isPending, accounts.isError, accounts.data);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">{i18n._(CONNECTIONS_COPY.title)}</h2>
        <p className="text-sm text-muted-foreground">
          {i18n._(CONNECTIONS_COPY.description)}
        </p>
      </div>

      {view.kind === CONNECTIONS_VIEW_KIND.LOADING && (
        <Skeleton className="h-24 w-full" />
      )}

      {view.kind === CONNECTIONS_VIEW_KIND.LOAD_ERROR && (
        <p className="text-sm text-muted-foreground">
          {i18n._(CONNECTIONS_COPY.loadError)}
        </p>
      )}

      {view.kind === CONNECTIONS_VIEW_KIND.CONNECTED && (
        <ItemGroup className="rounded-lg border">
          {view.accounts.map((account, index) => (
            <Fragment key={account.id}>
              <AccountRow account={account} />
              {index < view.accounts.length - 1 && <ItemSeparator />}
            </Fragment>
          ))}
        </ItemGroup>
      )}

      {view.kind === CONNECTIONS_VIEW_KIND.EMPTY && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{i18n._(CONNECTIONS_COPY.emptyTitle)}</EmptyTitle>
            <EmptyDescription>
              {i18n._(CONNECTIONS_COPY.emptyDescription)}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <Separator />

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-medium">{i18n._(CONNECTIONS_COPY.connect)}</h3>
        <ConnectAccount chrome="bare" redirectTo="/settings/connections" />
      </section>
    </div>
  );
}

function AccountRow({ account }: { account: TrackedAccount }) {
  const { i18n } = useLingui();
  const { Icon, label: platform } = GAME_SOURCES[account.platform];
  const [confirmOpen, setConfirmOpen] = useState(false);

  const disconnect = useDisconnectAccount();

  const confirmDisconnect = () => {
    disconnect.mutate(account.id, {
      onSuccess: () => {
        setConfirmOpen(false);
        toast.add({ type: "success", title: i18n._(CONNECTIONS_COPY.disconnectedTitle) });
      },
      onError: () => {
        setConfirmOpen(false);
        toast.add({
          type: "error",
          title: i18n._(CONNECTIONS_COPY.disconnectFailedTitle),
          description: i18n._(CONNECTIONS_COPY.disconnectFailedDescription),
        });
      },
    });
  };

  const { watch } = useSyncSettlementToast();
  const sync = useSyncAccount({
    onTooSoon: (retryAfterSeconds) => {
      toast.add({
        type: "info",
        title: i18n._(CONNECTIONS_COPY.tooSoon),
        description: i18n._({
          ...retryIn,
          values: { seconds: retryAfterSeconds },
        }),
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

  // The server's word, not this row's memory: a job it still holds reads
  // as running on any screen, after any reload.
  const syncing = isSyncInProgress(sync.isPending, [account]);
  const label = syncing ? CONNECTIONS_COPY.running : CONNECTIONS_COPY.sync;

  const handleSync = () => {
    sync.mutate(account.id, {
      onSuccess: (answer) => {
        if (!("retryAfterSeconds" in answer)) watch([answer.syncId]);
      },
    });
  };

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
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? <Spinner aria-hidden="true" /> : <RefreshCw />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={i18n._(CONNECTIONS_COPY.moreActions)}
              >
                <MoreVertical />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 />
              {i18n._(CONNECTIONS_COPY.disconnect)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={!disconnect.isPending}>
          <DialogHeader>
            <DialogTitle>{i18n._(CONNECTIONS_COPY.disconnectTitle)}</DialogTitle>
            <DialogDescription>
              {i18n._({
                ...CONNECTIONS_COPY.disconnectDescription,
                values: {
                  username: account.username,
                  platform,
                },
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={disconnect.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              {i18n._(CONNECTIONS_COPY.cancel)}
            </Button>
            <Button
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={confirmDisconnect}
            >
              {disconnect.isPending ? (
                <Spinner aria-hidden="true" />
              ) : (
                i18n._(CONNECTIONS_COPY.disconnectConfirm)
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Item>
  );
}
