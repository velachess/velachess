/** [ACCOUNTS] — the tracked-account lifecycle: connect, list, sync, disconnect. */

export { importAccount } from "./connect-account/connect-account.ts";
export type {
  ConnectAccountDeps,
  ConnectOutcome,
} from "./connect-account/connect-account.ts";

export { disconnectAccount } from "./disconnect-account/disconnect-account.ts";
export type {
  DisconnectAccountDeps,
  DisconnectOutcome,
} from "./disconnect-account/disconnect-account.ts";

export { listAccounts } from "./list-accounts/list-accounts.ts";
export type {
  JobError,
  ListAccountsDeps,
  TrackedAccountSummary,
} from "./list-accounts/list-accounts.ts";

export { listGamesWithStatus } from "./list-account-games/list-account-games.ts";
export type {
  GameWithStatus,
  ListAccountGamesDeps,
} from "./list-account-games/list-account-games.ts";

export { requestSync } from "./request-sync/request-sync.ts";
export type { RequestSyncDeps, RequestSyncOutcome } from "./request-sync/request-sync.ts";

export { syncAllAccounts } from "./sync-all-accounts/sync-all-accounts.ts";
export type { SyncAllAccountsDeps } from "./sync-all-accounts/sync-all-accounts.ts";

export { reconcileSyncs } from "./reconcile-syncs/reconcile-syncs.ts";
export type { ReconcileSyncsDeps } from "./reconcile-syncs/reconcile-syncs.ts";

export { watchSyncs } from "./watch-syncs/watch-syncs.ts";
export type { SyncSettled, WatchSyncsDeps } from "./watch-syncs/watch-syncs.ts";

export { syncAccount } from "./sync-account/sync-account.ts";
export type { SyncAccountDeps, SyncDeps } from "./sync-account/sync-account.ts";

export { SYNC_SETTLED_EVENTS } from "./sync-status.ts";
export type { SyncJobStatus } from "./sync-status.ts";
