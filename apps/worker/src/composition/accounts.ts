/**
 * Adapts what `main.ts` builds into the narrow `SyncAccountDeps`
 * `syncAccount` declared.
 */
import {
  finishSyncJob,
  getTrackedAccount,
  claimSyncAttempt,
  markSyncRunning,
  markTrackedAccountSynced,
  saveGames,
  updateTrackedAccountCursor,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import type { SyncAccountDeps, SyncDeps } from "@velachess/accounts";
import { logger } from "@velachess/infra-logger";

/** The slice declares the callback; the composition root owns the sink. */
const syncLogger = logger.child({ component: "sync" });

export function buildSyncAccountDeps(db: Database, sync: SyncDeps = {}): SyncAccountDeps {
  return {
    markSyncRunning: (id) => markSyncRunning(db, id),
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    withTransaction: (fn) => db.transaction(fn),
    claimSyncAttempt,
    finishSyncJob,
    saveGames,
    updateTrackedAccountCursor,
    markTrackedAccountSynced,
    onUnreadableCursor: (info) =>
      syncLogger.warn(info, "stored sync cursor did not parse; starting over"),
    // A caller may redirect either. Spread per key rather than `...sync`:
    // `exactOptionalPropertyTypes` treats an explicit `undefined` as a
    // value, which would erase the default.
    ...(sync.fetch ? { fetch: sync.fetch } : {}),
    ...(sync.onUnreadableCursor ? { onUnreadableCursor: sync.onUnreadableCursor } : {}),
  };
}
