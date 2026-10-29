/**
 * `syncStatus` is the newest job's own status, terminal ones included, so one
 * field answers both "still syncing" and "how did the last one end". `idle`
 * is the account that has no job at all.
 */
import type { AccountPlatform } from "@velachess/infra-platforms";

import type { SyncJobStatus } from "../sync-status.ts";

export type JobError = "not-found" | "incomplete" | "internal";

export interface TrackedAccountSummary {
  id: string;
  platform: AccountPlatform;
  username: string;
  lastSyncedAt: Date | null;
  latestJobStatus: SyncJobStatus | null;
  latestJobError: JobError | null;
}

type ListTrackedAccountsByUser = (userId: string) => Promise<TrackedAccountSummary[]>;

export interface ListAccountsDeps {
  listTrackedAccountsByUser: ListTrackedAccountsByUser;
}

/** The error survives only on a failure, so the next success clears it. */
export async function listAccounts(deps: ListAccountsDeps, userId: string) {
  const accounts = await deps.listTrackedAccountsByUser(userId);
  return accounts.map(({ latestJobStatus, latestJobError, ...account }) =>
    Object.assign(account, {
      syncStatus: latestJobStatus ?? ("idle" as const),
      lastSyncError: latestJobStatus === "failed" ? latestJobError : null,
    }),
  );
}
