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
import type { ProcessSyncDeps } from "@velachess/accounts";
import type { FetchFn } from "@velachess/infra-platforms";
import type { SyncQueue } from "@velachess/infra-queue";

export function buildProcessSyncDeps(
  db: Database,
  syncQueue: SyncQueue,
  fetch?: FetchFn,
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
    ...(fetch ? { fetch } : {}),
  };
}
