/**
 * Composition root for the accounts module: adapts the DB client, queues,
 * and fetch-override fixture every route already carries into the narrow
 * readers/writers each accounts route's slice declared. Routes never see
 * a Database or SyncQueue value directly.
 *
 * The worker builds `syncAccount`'s deps on its own
 * (`apps/worker/src/composition/accounts.ts`) — apps never share a
 * composition helper.
 */
import {
  abandonSyncJob,
  createSyncJob,
  deleteTrackedAccountAndGames,
  findTrackedAccountByPlatform,
  getSyncJobForUser,
  getTrackedAccountForUser,
  listGamesWithStatusForAccount,
  listTrackedAccountsByUser,
  lockLatestSyncJob,
  markUserOnboarded,
  upsertProviderProfile,
  insertTrackedAccount,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import type {
  ConnectAccountDeps,
  DisconnectAccountDeps,
  GetSyncDeps,
  ListAccountGamesDeps,
  ListAccountsDeps,
  RequestSyncDeps,
} from "@velachess/accounts";
import type { FetchFn } from "@velachess/infra-platforms";
import type { SyncQueue } from "@velachess/infra-queue";

export function buildListAccountsDeps(db: Database): ListAccountsDeps {
  return {
    listTrackedAccountsByUser: (userId) => listTrackedAccountsByUser(db, userId),
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

export function buildRequestSyncDeps(
  db: Database,
  syncQueue: SyncQueue,
): RequestSyncDeps {
  return {
    getTrackedAccountForUser: (userId, accountId) =>
      getTrackedAccountForUser(db, userId, accountId),
    withTransaction: (fn) => db.transaction(fn),
    lockLatestSyncJob,
    isSyncDeliveryLive: (tx, jobId) => syncQueue.isLive(tx, jobId),
    abandonSyncJob,
    createSyncJob,
    enqueueSync: (tx, job) => syncQueue.enqueue(tx, job),
  };
}

export function buildGetSyncDeps(db: Database, syncQueue: SyncQueue): GetSyncDeps {
  return {
    getSyncJobForUser: (userId, id) => getSyncJobForUser(db, userId, id),
    isSyncDeliveryLive: (jobId) => syncQueue.isLive(db, jobId),
    abandonSyncJob: (jobId) => abandonSyncJob(db, jobId),
  };
}

export function buildImportAccountDeps(
  db: Database,
  syncQueue: SyncQueue,
  fetch?: FetchFn,
): ConnectAccountDeps {
  return {
    upsertProviderProfile: (seat, fetched) => upsertProviderProfile(db, seat, fetched),
    getTrackedAccountByPlatform: (userId, platform) =>
      findTrackedAccountByPlatform(db, userId, platform),
    withTransaction: (fn) => db.transaction(fn),
    insertTrackedAccount,
    createSyncJob,
    enqueueSync: (tx, job) => syncQueue.enqueue(tx, job),
    markOnboarded: (userId) => markUserOnboarded(db, userId),
    ...(fetch ? { fetch } : {}),
  };
}

export function buildDisconnectAccountDeps(db: Database): DisconnectAccountDeps {
  return {
    getTrackedAccountForUser: (userId, accountId) =>
      getTrackedAccountForUser(db, userId, accountId),
    deleteAccountAndItsGames: (accountId) => deleteTrackedAccountAndGames(db, accountId),
  };
}
