/**
 * Composition root for the accounts module: adapts the DB client, queues,
 * and fetch-override fixture every route already carries into the narrow
 * readers/writers each accounts route's slice declared. Routes never see
 * a Database, AnalysisQueue, or SyncQueue value directly.
 *
 * `buildSyncAccountDeps` is shared by three call sites: `refreshAccount`'s
 * own route, `importAccount`'s `syncAccount` dependency (its own
 * module-mate, wired through composition like any other capability — see
 * `@velachess/accounts`'s connect-account.ts doc comment), and
 * `apps/worker/src/composition/accounts.ts`'s equivalent for
 * `processAccountSync` (built independently there — apps never share a
 * composition helper).
 */
import {
  findProviderProfiles,
  getTrackedAccount,
  getTrackedAccountForUser,
  isProfileFresh,
  listGamesWithStatusForAccount,
  listTrackedAccountsByUser,
  markTrackedAccountSynced,
  saveGames,
  updateTrackedAccountCursor,
  upsertProviderProfile,
  upsertTrackedAccount,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import { syncAccount as syncAccountSlice } from "@velachess/accounts";
import type {
  ConnectAccountDeps,
  ListAccountGamesDeps,
  ListAccountsDeps,
  SyncAccountDeps,
} from "@velachess/accounts";
import { landNewGames as landNewGamesSlice } from "@velachess/games";
import { ensureCandidateRepertoires } from "@velachess/repertoires";
import { seedRepertoireLines } from "@velachess/drills";
import type { FetchFn } from "@velachess/infra-platforms";
import type { AnalysisQueue, SyncQueue } from "@velachess/infra-queue";

import { buildLandNewGamesDeps } from "./games.ts";

export function buildListAccountsDeps(
  db: Database,
  syncQueue: SyncQueue,
): ListAccountsDeps {
  return {
    listTrackedAccountsByUser: (userId) => listTrackedAccountsByUser(db, userId),
    getSyncState: (accountId) => syncQueue.getState(accountId),
  };
}

export function buildListAccountGamesDeps(db: Database): ListAccountGamesDeps {
  return {
    getTrackedAccountForUser: (userId, accountId) =>
      getTrackedAccountForUser(db, userId, accountId),
    listGamesWithStatusForAccount: (accountId) =>
      listGamesWithStatusForAccount(db, accountId),
  };
}

export function buildSyncAccountDeps(
  db: Database,
  analysisQueue: AnalysisQueue,
  fetch?: FetchFn,
): SyncAccountDeps {
  return {
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    getTrackedAccountForUser: (userId, accountId) =>
      getTrackedAccountForUser(db, userId, accountId),
    saveGames: (games, opts) => saveGames(db, games, opts),
    updateTrackedAccountCursor: (accountId, cursor) =>
      updateTrackedAccountCursor(db, accountId, cursor),
    markTrackedAccountSynced: (accountId) => markTrackedAccountSynced(db, accountId),
    landNewGames: (userId, newGames) =>
      landNewGamesSlice(buildLandNewGamesDeps(db, analysisQueue), userId, newGames),
    ...(fetch ? { fetch } : {}),
  };
}

export function buildImportAccountDeps(
  db: Database,
  analysisQueue: AnalysisQueue,
  fetch?: FetchFn,
): ConnectAccountDeps {
  const syncDeps = buildSyncAccountDeps(db, analysisQueue, fetch);
  return {
    findProviderProfiles: (seats) => findProviderProfiles(db, seats),
    upsertProviderProfile: (seat, fetched) => upsertProviderProfile(db, seat, fetched),
    isProfileFresh,
    upsertTrackedAccount: (userId, platform, username) =>
      upsertTrackedAccount(db, userId, platform, username),
    getTrackedAccount: (accountId) => getTrackedAccount(db, accountId),
    syncAccount: (accountId) => syncAccountSlice(syncDeps, accountId),
    ensureCandidateRepertoires: (userId, opts) =>
      ensureCandidateRepertoires(db, userId, opts, (candidateUserId, repertoireId) =>
        seedRepertoireLines(db, candidateUserId, repertoireId),
      ).then(() => {}),
    ...(fetch ? { fetch } : {}),
  };
}
