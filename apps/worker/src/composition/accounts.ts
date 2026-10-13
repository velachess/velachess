/**
 * Composition root for the accounts module's worker-side handler: adapts
 * the DB client and fetch-override fixture `main.ts` builds into the narrow
 * `SyncAccountDeps` `syncAccount` declared.
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
import { consumeProviderInterval, type Redis } from "@velachess/infra-rate-limit";
import type { AccountPlatform } from "@velachess/infra-platforms";
import type { SyncAccountDeps, SyncDeps } from "@velachess/accounts";
import { logger } from "@velachess/infra-logger";

/** The cursor warning needs somewhere to land; the slice declares the
 * callback and the composition root owns the sink. */
const syncLogger = logger.child({ component: "sync" });

/**
 * `main.ts`'s real admission control, kept out of `buildSyncAccountDeps`'s
 * own defaults so a caller that passes no `sync` override — every existing
 * test — gets none, same as it does for `fetch`.
 *
 * This is deliberately NOT a concurrency gate: `apps/worker/src/worker.ts`'s
 * `groupConcurrency: 1` already caps one in-flight job per provider, in
 * Postgres, across every worker node — a hand-rolled Redis lock here would
 * duplicate that. What this gates is the gap BETWEEN calls, which no
 * pg-boss option expresses: `intervalsMs` is per-provider and configured by
 * `main.ts` from env, not invented here.
 */
export function buildProviderSyncRateLimiter(
  redis: Redis,
  intervalsMs: Record<AccountPlatform, number>,
) {
  return (platform: AccountPlatform) =>
    consumeProviderInterval(redis, `provider:${platform}`, intervalsMs[platform]);
}

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
    // A caller may redirect any of these — a test harness reads the
    // archive through a fixture, asserts on the cursor warning, or injects
    // a throttle verdict itself. Spread per key, not `...sync`:
    // `exactOptionalPropertyTypes` treats an explicit `undefined` as a
    // value, which would erase the default.
    ...(sync.fetch ? { fetch: sync.fetch } : {}),
    ...(sync.onUnreadableCursor ? { onUnreadableCursor: sync.onUnreadableCursor } : {}),
    ...(sync.consumeProviderRateLimit
      ? { consumeProviderRateLimit: sync.consumeProviderRateLimit }
      : {}),
  };
}
