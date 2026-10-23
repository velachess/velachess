/**
 * Fans out the unchanged `requestSync` per account, whose cooldown and
 * single-flight guard are the only ones. A caller gets back the jobs in
 * flight: a cooling-down or already-running account is folded out, since
 * there is nothing new to watch there.
 */
import type { RequestSyncOutcome } from "../request-sync/request-sync.ts";

type ListAccountIds = (userId: string) => Promise<string[]>;
type RequestSync = (userId: string, accountId: string) => Promise<RequestSyncOutcome>;

export interface SyncAllAccountsDeps {
  listAccountIds: ListAccountIds;
  requestSync: RequestSync;
}

export async function syncAllAccounts(deps: SyncAllAccountsDeps, userId: string) {
  const accountIds = await deps.listAccountIds(userId);
  // Different accounts lock different rows.
  const outcomes = await Promise.all(
    accountIds.map((accountId) => deps.requestSync(userId, accountId)),
  );
  const syncIds = outcomes.flatMap((outcome) =>
    outcome.status === "accepted" ? [outcome.job.id] : [],
  );
  return { syncIds };
}
