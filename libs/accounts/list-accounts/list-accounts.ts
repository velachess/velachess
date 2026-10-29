/**
 * `syncStatus`, not just `lastSyncedAt`, is what lets a client tell "still
 * syncing" from "gave up".
 */
import type { AccountPlatform } from "@velachess/infra-platforms";

import { isActiveSyncStatus, type SyncJobStatus } from "../sync-status.ts";

export type JobError = "not-found" | "incomplete" | "internal";

export interface TrackedAccountSummary {
  id: string;
  platform: AccountPlatform;
  username: string;
  lastSyncedAt: Date | null;
  latestJobId: string | null;
  latestJobStatus: SyncJobStatus | null;
  latestJobError: JobError | null;
}

type ListTrackedAccountsByUser = (userId: string) => Promise<TrackedAccountSummary[]>;
type IsSyncDeliveryLive = (jobId: string) => Promise<boolean>;
type AbandonSyncJob = (jobId: string) => Promise<void>;

export interface ListAccountsDeps {
  listTrackedAccountsByUser: ListTrackedAccountsByUser;
  isSyncDeliveryLive: IsSyncDeliveryLive;
  abandonSyncJob: AbandonSyncJob;
}

/**
 * Sync state reads off each account's newest job: its status and id while
 * active, then `idle` with the error it failed on, which the next success
 * clears.
 *
 * An active row whose delivery pg-boss ended is closed first, the same way
 * `getSync` closes it. Read raw, such a row says "syncing" for good: the
 * dead-letter queue is where the job went and nothing comes back to settle
 * it, so the button never re-enables and the one-active-per-account index
 * holds every later sync out.
 */
export async function listAccounts(deps: ListAccountsDeps, userId: string) {
  const listed = await deps.listTrackedAccountsByUser(userId);
  // flatMap rather than filter: it narrows the id, which a predicate over
  // the account does not.
  const running = listed.flatMap(({ latestJobId, latestJobStatus }) =>
    isActiveSyncStatus(latestJobStatus) && latestJobId !== null ? [latestJobId] : [],
  );
  await Promise.all(
    running.map(async (jobId) => {
      if (!(await deps.isSyncDeliveryLive(jobId))) await deps.abandonSyncJob(jobId);
    }),
  );
  const accounts =
    running.length > 0 ? await deps.listTrackedAccountsByUser(userId) : listed;

  return accounts.map(({ latestJobId, latestJobStatus, latestJobError, ...account }) => {
    // A predicate, so `latestJobStatus` stays narrowed: `syncStatus` is the
    // active status itself, never `succeeded` or `failed`.
    const active = isActiveSyncStatus(latestJobStatus);
    return Object.assign(account, {
      syncStatus: active ? latestJobStatus : ("idle" as const),
      activeSyncId: active ? latestJobId : null,
      lastSyncError: latestJobStatus === "failed" ? latestJobError : null,
    });
  });
}
