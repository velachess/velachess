/**
 * [ACCOUNTS] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel. See AGENTS.md "Modules and slices" for
 * what belongs here versus what stays a private slice file.
 */

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

export { getSync } from "./get-sync/get-sync.ts";
export type { GetSyncDeps } from "./get-sync/get-sync.ts";

export { syncAccount } from "./sync-account/sync-account.ts";
export type { SyncAccountDeps, SyncDeps } from "./sync-account/sync-account.ts";
