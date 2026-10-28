import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Fragment, useId, useState, type ReactNode } from "react";

import { Alert, AlertAction, AlertTitle } from "@velachess/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@velachess/ui/components/alert-dialog";
import { Badge } from "@velachess/ui/components/badge";
import { Button } from "@velachess/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@velachess/ui/components/item";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { Spinner } from "@velachess/ui/components/spinner";
import { toast } from "@velachess/ui/components/toast";
import { MoreVertical, OctagonXIcon, RefreshCw, Trash2 } from "@velachess/ui/icons";

import { GAME_SOURCES } from "../../games/game-sources.ts";
import { SourceMark } from "../../games/source-mark.tsx";
import {
  ConnectAccount,
  isSyncInProgress,
  SOURCE_ORDER,
  trackedAccountsQuery,
  useDisconnectAccount,
  useSyncAccount,
  useSyncSettlementToast,
  type SourceId,
  type TrackedAccount,
} from "../../games/import/index.ts";
import { useQuery } from "../../libs/react-query.ts";
import { SettingsSection } from "../layout/settings-section.tsx";

const CONNECTIONS_COPY = {
  title: msg`Chess accounts`,
  description: msg`Where VelaChess imports your games from.`,
  loadError: msg`Couldn't load your connected accounts.`,
  tryAgain: msg`Try again`,
  connected: msg`Connected`,
  notConnected: msg`Not connected`,
  syncFailed: msg`Sync failed`,
  syncingStatus: msg`Syncing`,
  lastSynced: msg`Synced {date}`,
  neverSynced: msg`Not synced yet`,
  connect: msg`Connect`,
  connectProvider: msg`Connect {platform}`,
  connectDescription: msg`VelaChess reads your public games. No password needed.`,
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
  disconnectedTitle: msg`Connection removed`,
  disconnectFailedTitle: msg`Couldn't remove the connection`,
  disconnectFailedDescription: msg`Try again in a moment.`,
} as const;

const retryIn = msg`{seconds, plural, one {Try again in # second.} other {Try again in # seconds.}}`;

const CONNECTIONS_VIEW_KIND = {
  LOADING: "loading",
  LOAD_ERROR: "load-error",
  READY: "ready",
} as const;

type ConnectionsView =
  | { kind: typeof CONNECTIONS_VIEW_KIND.LOADING }
  | { kind: typeof CONNECTIONS_VIEW_KIND.LOAD_ERROR }
  | { kind: typeof CONNECTIONS_VIEW_KIND.READY; accounts: TrackedAccount[] };

function connectionsView(
  isPending: boolean,
  isError: boolean,
  data: TrackedAccount[] | undefined,
): ConnectionsView {
  if (isPending) return { kind: CONNECTIONS_VIEW_KIND.LOADING };
  if (isError || data === undefined) return { kind: CONNECTIONS_VIEW_KIND.LOAD_ERROR };
  return { kind: CONNECTIONS_VIEW_KIND.READY, accounts: data };
}

export function ConnectionsScreen() {
  const { i18n } = useLingui();
  const accounts = useQuery(trackedAccountsQuery);
  const view = connectionsView(accounts.isPending, accounts.isError, accounts.data);

  return (
    <SettingsSection
      title={i18n._(CONNECTIONS_COPY.title)}
      description={i18n._(CONNECTIONS_COPY.description)}
    >
      {view.kind === CONNECTIONS_VIEW_KIND.LOADING && (
        <ItemGroup className="gap-0 rounded-lg border">
          {SOURCE_ORDER.map((provider, index) => (
            <Fragment key={provider}>
              {index > 0 && <ItemSeparator className="my-0" />}
              <Item className="px-4 py-3">
                <Skeleton className="size-9 rounded-md" />
                <ItemContent className="gap-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3.5 w-40" />
                </ItemContent>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      )}

      {view.kind === CONNECTIONS_VIEW_KIND.LOAD_ERROR && (
        <Alert variant="destructive">
          <OctagonXIcon aria-hidden="true" />
          <AlertTitle>{i18n._(CONNECTIONS_COPY.loadError)}</AlertTitle>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void accounts.refetch()}>
              {i18n._(CONNECTIONS_COPY.tryAgain)}
            </Button>
          </AlertAction>
        </Alert>
      )}

      {view.kind === CONNECTIONS_VIEW_KIND.READY && (
        <ItemGroup className="gap-0 rounded-lg border">
          {SOURCE_ORDER.map((provider, index) => (
            <Fragment key={provider}>
              {index > 0 && <ItemSeparator className="my-0" />}
              <ProviderRow
                provider={provider}
                account={view.accounts.find((account) => account.platform === provider)}
              />
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </SettingsSection>
  );
}

function ProviderRow({
  provider,
  account,
}: {
  provider: SourceId;
  account: TrackedAccount | undefined;
}) {
  if (account) return <ConnectedRow account={account} />;
  return <AvailableRow provider={provider} />;
}

function ProviderItem({
  provider,
  status,
  description,
  actions,
}: {
  provider: SourceId;
  status?: ReactNode;
  description: ReactNode;
  actions: ReactNode;
}) {
  const nameId = useId();
  const { label } = GAME_SOURCES[provider];

  return (
    <Item render={<li />} aria-labelledby={nameId} className="px-4 py-3">
      <ItemMedia className="size-9 rounded-md bg-muted">
        <SourceMark source={provider} className="size-5" />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle>
          <span id={nameId}>{label}</span>
          {status}
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>{actions}</ItemActions>
    </Item>
  );
}

function AvailableRow({ provider }: { provider: SourceId }) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const platform = GAME_SOURCES[provider].label;
  const connectLabel = i18n._({
    ...CONNECTIONS_COPY.connectProvider,
    values: { platform },
  });

  return (
    <>
      <ProviderItem
        provider={provider}
        description={i18n._(CONNECTIONS_COPY.notConnected)}
        actions={
          <Button
            variant="outline"
            size="sm"
            aria-label={connectLabel}
            onClick={() => setOpen(true)}
          >
            {i18n._(CONNECTIONS_COPY.connect)}
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{connectLabel}</DialogTitle>
            <DialogDescription>
              {i18n._(CONNECTIONS_COPY.connectDescription)}
            </DialogDescription>
          </DialogHeader>
          <ConnectAccount
            chrome="bare"
            source={provider}
            onImported={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

type AccountStatus = "syncing" | "failed" | "connected";

function accountStatus(syncing: boolean, account: TrackedAccount): AccountStatus {
  if (syncing) return "syncing";
  if (account.lastSyncError !== null) return "failed";
  return "connected";
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const { i18n } = useLingui();

  if (status === "syncing") {
    return (
      <Badge variant="info">
        <Spinner aria-hidden="true" data-icon="inline-start" />
        {i18n._(CONNECTIONS_COPY.syncingStatus)}
      </Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">{i18n._(CONNECTIONS_COPY.syncFailed)}</Badge>;
  }
  return <Badge variant="success">{i18n._(CONNECTIONS_COPY.connected)}</Badge>;
}

function ConnectedRow({ account }: { account: TrackedAccount }) {
  const { i18n } = useLingui();
  const platform = GAME_SOURCES[account.platform].label;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const disconnect = useDisconnectAccount();

  const handleConfirmOpenChange = (next: boolean) => {
    if (disconnect.isPending) return;
    setConfirmOpen(next);
  };

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
        id: "sync-account-too-soon",
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
        id: "sync-account-failed",
        type: "error",
        title: i18n._(CONNECTIONS_COPY.failed),
        description: i18n._(CONNECTIONS_COPY.retry),
      });
    },
  });

  // The server's status, not this row's, so a held job reads as running
  // after a reload.
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
    <>
      <ProviderItem
        provider={account.platform}
        status={<StatusBadge status={accountStatus(syncing, account)} />}
        description={
          <>
            <span className="font-medium text-foreground">{account.username}</span>
            <span aria-hidden="true"> · </span>
            <LastSynced lastSyncedAt={account.lastSyncedAt} />
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={i18n._(label)}
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw />
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
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 />
                  {i18n._(CONNECTIONS_COPY.disconnect)}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {i18n._(CONNECTIONS_COPY.disconnectTitle)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {i18n._({
                ...CONNECTIONS_COPY.disconnectDescription,
                values: {
                  username: account.username,
                  platform,
                },
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>
              {i18n._(CONNECTIONS_COPY.cancel)}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={confirmDisconnect}
            >
              {disconnect.isPending && <Spinner aria-hidden="true" />}
              {!disconnect.isPending && i18n._(CONNECTIONS_COPY.disconnectConfirm)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LastSynced({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const { i18n } = useLingui();

  if (lastSyncedAt === null) return <span>{i18n._(CONNECTIONS_COPY.neverSynced)}</span>;

  const date = i18n.date(new Date(lastSyncedAt), { dateStyle: "medium" });
  return <span>{i18n._({ ...CONNECTIONS_COPY.lastSynced, values: { date } })}</span>;
}
