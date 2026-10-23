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

export interface ListAccountsDeps {
  listTrackedAccountsByUser: ListTrackedAccountsByUser;
}

/**
 * Sync state reads off each account's newest job: its status and id while
 * active, then `idle` with the error it failed on, which the next success
 * clears.
 */
export async function listAccounts(deps: ListAccountsDeps, userId: string) {
  const accounts = await deps.listTrackedAccountsByUser(userId);
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
