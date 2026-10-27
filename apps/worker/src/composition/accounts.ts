/**
 * Adapts what `main.ts` builds into the narrow `SyncAccountDeps`
 * `syncAccount` declared.
 */
import {
  findProviderProfiles,
  finishSyncJob,
  getTrackedAccount,
  claimSyncAttempt,
  isProfileFresh,
  markSyncRunning,
  markTrackedAccountSynced,
  saveGames,
  updateTrackedAccountCursor,
  upsertProviderProfile,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import { warmProfiles } from "@velachess/accounts";
import type { SyncAccountDeps, SyncDeps } from "@velachess/accounts";
import { fetchPlayerProfile } from "@velachess/infra-platforms";
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
    warmProfiles: (platform, usernames) =>
      warmProfiles(
        {
          findProviderProfiles: (seats) => findProviderProfiles(db, seats),
          upsertProviderProfile: async (seat, fetched) => {
            await upsertProviderProfile(db, seat, fetched);
          },
          isProfileFresh,
          fetchProfile: (seat) =>
            fetchPlayerProfile(seat, sync.fetch ? { fetch: sync.fetch } : {}),
        },
        platform,
        usernames,
      ),
    onUnreadableCursor: (info) =>
      syncLogger.warn(info, "stored sync cursor did not parse; starting over"),
    // A caller may redirect either. Spread per key rather than `...sync`:
    // `exactOptionalPropertyTypes` treats an explicit `undefined` as a
    // value, which would erase the default.
    ...(sync.fetch ? { fetch: sync.fetch } : {}),
    ...(sync.onUnreadableCursor ? { onUnreadableCursor: sync.onUnreadableCursor } : {}),
  };
}
