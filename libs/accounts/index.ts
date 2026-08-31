/**
 * [ACCOUNTS] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel. See AGENTS.md "Modules and slices" for
 * what belongs here versus what stays a private slice file.
 *
 * `syncAccount`/`SyncAccountDeps` are exposed here for one reason beyond
 * `refreshAccount`/`processAccountSync`'s own use: `connect-account` (its
 * own module-mate) declares a `SyncAccount` dependency type and needs the
 * composition root to wire the real handler in — the same reason
 * `games/index.ts` exposes `landNewGames` for `import-pgn`'s own
 * composition to reach.
 */

export { importAccount } from "./connect-account/connect-account.ts";
export type { ConnectAccountDeps, Platform } from "./connect-account/connect-account.ts";

export { listAccounts } from "./list-accounts/list-accounts.ts";
export type {
  ListAccountsDeps,
  SyncState,
  TrackedAccountSummary,
} from "./list-accounts/list-accounts.ts";

export { listGamesWithStatus } from "./list-account-games/list-account-games.ts";
export type {
  GameWithStatus,
  ListAccountGamesDeps,
} from "./list-account-games/list-account-games.ts";

export {
  processAccountSync,
  refreshAccount,
  secondsUntilRefreshAllowed,
  syncAccount,
  SYNC_COOLDOWN_SECONDS,
} from "./sync-account/sync-account.ts";
export type {
  RefreshOutcome,
  SyncAccountDeps,
  SyncDeps,
  SyncOutcome,
} from "./sync-account/sync-account.ts";
