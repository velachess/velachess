// @vitest-environment node
/**
 * A caller only needs the jobs it should start watching — a cooldown or an
 * already-active account answers "accepted" from `requestSync` itself, so
 * folding those out here is really just `requestSync`'s own idempotency,
 * read through a filter.
 */
import { describe, expect, it } from "vitest";

import type { SyncJob } from "@velachess/infra-db";

import { syncAllAccounts, type SyncAllAccountsDeps } from "../index.ts";
import type { RequestSyncOutcome } from "../request-sync/request-sync.ts";

function aJob(id: string): SyncJob {
  return {
    id,
    userId: "me",
    accountId: "account",
    trigger: "manual",
    status: "queued",
    gamesFetched: null,
    gamesInserted: null,
    errorCode: null,
    createdAt: new Date(),
    startedAt: null,
    finishedAt: null,
  };
}

function anAccountList(
  accountIds: string[],
  outcomes: Record<string, RequestSyncOutcome>,
) {
  const requested: string[] = [];
  const deps: SyncAllAccountsDeps = {
    listAccountIds: async () => accountIds,
    requestSync: async (_userId, accountId) => {
      requested.push(accountId);
      return outcomes[accountId]!;
    },
  };
  return { deps, requested };
}

describe("syncAllAccounts", () => {
  it("answers only the accounts that actually started a job", async () => {
    const { deps, requested } = anAccountList(["a", "b", "c"], {
      a: { status: "accepted", job: aJob("job-a") },
      b: { status: "too-soon", retryAfterSeconds: 42 },
      c: { status: "accepted", job: aJob("job-c") },
    });

    const result = await syncAllAccounts(deps, "me");

    expect(result).toEqual({ syncIds: ["job-a", "job-c"] });
    expect(requested).toEqual(["a", "b", "c"]);
  });

  it("asks nothing and answers an empty list when there is nothing to sync", async () => {
    const { deps, requested } = anAccountList([], {});

    expect(await syncAllAccounts(deps, "me")).toEqual({ syncIds: [] });
    expect(requested).toEqual([]);
  });
});
