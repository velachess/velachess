/**
 * Composition root for the accounts module's worker-side consumer: adapts
 * the DB client and fetch-override fixture `main.ts` already builds into
 * the narrow `SyncAccountDeps` `processAccountSync` declared. A duplicate
 * of `apps/server/src/composition/accounts.ts`'s `buildSyncAccountDeps`
 * in shape only — apps never share a composition helper
 * (`no-cross-app-runtime-imports`), so each builds its own.
 */
import {
  getTrackedAccount,
  getTrackedAccountForUser,
  markTrackedAccountSynced,
  saveGames,
  updateTrackedAccountCursor,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import type { SyncAccountDeps } from "@velachess/accounts";
import type { FetchFn } from "@velachess/infra-platforms";

export function buildSyncAccountDeps(db: Database, fetch?: FetchFn): SyncAccountDeps {
  return {
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    getTrackedAccountForUser: (userId, accountId) =>
      getTrackedAccountForUser(db, userId, accountId),
    saveGames: (games, opts) => saveGames(db, games, opts),
    updateTrackedAccountCursor: (accountId, cursor) =>
      updateTrackedAccountCursor(db, accountId, cursor),
    markTrackedAccountSynced: (accountId) => markTrackedAccountSynced(db, accountId),
    ...(fetch ? { fetch } : {}),
  };
}
