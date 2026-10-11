/**
 * Composition root for the accounts module's worker-side consumer: adapts
 * the DB client, sync queue and fetch-override fixture `main.ts` builds into
 * the narrow `ProcessSyncDeps` `processSync` declared.
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
import type { SyncQueue } from "@velachess/infra-queue";

/** The cursor warning needs somewhere to land; the slice declares the
 * callback and the composition root owns the sink. */
const syncLogger = logger.child({ component: "sync" });

export function buildProcessSyncDeps(
  db: Database,
  syncQueue: SyncQueue,
  sync: SyncDeps = {},
): ProcessSyncDeps {
  return {
    markSyncRunning: (id) => markSyncRunning(db, id),
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    withTransaction: (fn) => db.transaction(fn),
    lockSyncJob,
    finishSyncJob,
    saveGames,
    updateTrackedAccountCursor,
    markTrackedAccountSynced,
    completeDelivery: (tx, delivery) => syncQueue.complete(tx, delivery),
    failDelivery: (tx, delivery) => syncQueue.fail(tx, delivery),
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
