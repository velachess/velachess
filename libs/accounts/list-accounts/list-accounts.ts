/**
 * ListAccounts — every handle this user tracks, with delivery state.
 * `syncState` (not just `lastSyncedAt`) lets a client tell "still syncing" from "gave up".
 */
type Platform = "chess_com" | "lichess";
export type SyncState = "queued" | "active" | "failed" | "none";

export interface TrackedAccountSummary {
  id: string;
  platform: Platform;
  username: string;
  lastSyncedAt: Date | null;
}

type ListTrackedAccountsByUser = (userId: string) => Promise<TrackedAccountSummary[]>;
type GetSyncState = (accountId: string) => Promise<SyncState>;

export interface ListAccountsDeps {
  listTrackedAccountsByUser: ListTrackedAccountsByUser;
  getSyncState: GetSyncState;
}

/**
 * The accounts a user tracks, oldest first, each decorated with its
 * delivery state. `lastSyncedAt` tells a caller whether this account
 * ever completed a pass — the difference between "not connected" and
 * "connected, nothing synced yet".
 */
export async function listAccounts(deps: ListAccountsDeps, userId: string) {
  const accounts = await deps.listTrackedAccountsByUser(userId);
  return Promise.all(
    accounts.map(async (account) =>
      Object.assign({}, account, {
        syncState: await deps.getSyncState(account.id),
      }),
    ),
  );
}
