/**
 * Composition root for the accounts module's worker-side handler: adapts
 * the DB client and fetch-override fixture `main.ts` builds into the narrow
 * `ProcessSyncDeps` `processSync` declared.
 */
import {
  finishSyncJob,
  getTrackedAccount,
  lockSyncJob,
  markSyncRunning,
  markTrackedAccountSynced,
  saveGames,
  updateTrackedAccountCursor,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import type { ProcessSyncDeps, SyncDeps } from "@velachess/accounts";
import { logger } from "@velachess/infra-logger";

/** The cursor warning needs somewhere to land; the slice declares the
 * callback and the composition root owns the sink. */
const syncLogger = logger.child({ component: "sync" });

export function buildProcessSyncDeps(db: Database, sync: SyncDeps = {}): ProcessSyncDeps {
  return {
    markSyncRunning: (id) => markSyncRunning(db, id),
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    withTransaction: (fn) => db.transaction(fn),
    lockSyncJob,
    finishSyncJob,
    saveGames,
    updateTrackedAccountCursor,
    markTrackedAccountSynced,
    onUnreadableCursor: (info) =>
      syncLogger.warn(info, "stored sync cursor did not parse; starting over"),
    // A caller may redirect either — a test harness reads the archive
    // through a fixture and may want the cursor warning itself. Spread
    // per key, not `...sync`: `exactOptionalPropertyTypes` treats an
    // explicit `undefined` as a value, which would erase the default.
    ...(sync.fetch ? { fetch: sync.fetch } : {}),
    ...(sync.onUnreadableCursor ? { onUnreadableCursor: sync.onUnreadableCursor } : {}),
  };
}
