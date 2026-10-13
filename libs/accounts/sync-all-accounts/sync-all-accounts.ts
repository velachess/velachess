/**
 * SyncAllAccounts — "sync my games", one request for every tracked account.
 *
 * Fans out the unchanged `requestSync` per account: its cooldown and
 * single-flight guard are the only source of truth, this slice adds none of
 * its own. A caller gets back only the jobs actually in flight — a cooldown
 * or an already-running job on one account is folded out, not reported,
 * since there is nothing new for a caller to watch there.
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
  // Different accounts lock different rows: nothing here contends.
  const outcomes = await Promise.all(
    accountIds.map((accountId) => deps.requestSync(userId, accountId)),
  );
  const syncIds = outcomes.flatMap((outcome) =>
    outcome.status === "accepted" ? [outcome.job.id] : [],
  );
  return { syncIds };
}
