/**
 * ListAccounts — every handle this user tracks, with its sync state.
 * `syncStatus` (not just `lastSyncedAt`) lets a client tell "still syncing"
 * from "gave up".
 */
type Platform = "chess_com" | "lichess";
type JobStatus = "queued" | "running" | "retrying" | "succeeded" | "failed";
type JobError = "not-found" | "incomplete" | "internal";

export interface TrackedAccountSummary {
  id: string;
  platform: Platform;
  username: string;
  lastSyncedAt: Date | null;
  latestJobId: string | null;
  latestJobStatus: JobStatus | null;
  latestJobError: JobError | null;
}

type ListTrackedAccountsByUser = (userId: string) => Promise<TrackedAccountSummary[]>;

export interface ListAccountsDeps {
  listTrackedAccountsByUser: ListTrackedAccountsByUser;
}

/**
 * The accounts a user tracks, oldest first. Sync state reads off each
 * account's newest job: while it is active, its status and id; once it
 * has finished, `idle` — with its error when it failed, so the next success
 * clears it.
 */
export async function listAccounts(deps: ListAccountsDeps, userId: string) {
  const accounts = await deps.listTrackedAccountsByUser(userId);
  return accounts.map(({ latestJobId, latestJobStatus, latestJobError, ...account }) => {
    const active =
      latestJobStatus === "queued" ||
      latestJobStatus === "running" ||
      latestJobStatus === "retrying";
    return Object.assign(account, {
      syncStatus: active ? latestJobStatus : ("idle" as const),
      activeSyncId: active ? latestJobId : null,
      lastSyncError: latestJobStatus === "failed" ? latestJobError : null,
    });
  });
}
