import { useEffect, useEffectEvent, useState } from "react";

import { api, parseResponse, type InferResponseType } from "../../api/index.ts";
import { isRateLimitedError } from "../../api/index.ts";
import {
  queryOptions,
  useMutation,
  useQueries,
  useQueryClient,
} from "../../libs/react-query.ts";
import { useMyAccounts, type RememberedAccount } from "./my-accounts.ts";
import { INPUT_KINDS, type SourceId } from "./sources.ts";

export type TrackedAccount = InferResponseType<typeof api.accounts.$get, 200>[number];

/** Lichess serves its flairs from one public asset directory keyed by the
 * id the API reports (`people.santa-claus` → `<dir>/people.santa-claus.webp`),
 * rendered as webp by its own frontend. Only the id crosses the API; the
 * address is presentation. */
const LICHESS_FLAIR_ASSETS = "https://lichess1.org/assets/flair/img";

export function flairImageOf(flair: string): string {
  return `${LICHESS_FLAIR_ASSETS}/${flair}.webp`;
}

/** Tracked accounts per the server, not localStorage's `my-accounts` — a new machine or rebuilt DB can desync from local memory. */
export const trackedAccountsQuery = queryOptions({
  queryKey: ["accounts"],
  queryFn: () => parseResponse(api.accounts.$get()),
});

export type ImportRequest = {
  kind: typeof INPUT_KINDS.username;
  source: SourceId;
  username: string;
};

/** POST is the only way to create an account — the old `GET /games?platform&username` upsert-on-read broke first imports with 404. */
async function connectAccount(platform: SourceId, username: string) {
  return parseResponse(api.accounts.$post({ json: { platform, username } }));
}

/** Connects the handle, then remembers it under the server's returned username, not the typed one — platforms normalise it. */
export async function importArchive(request: ImportRequest): Promise<RememberedAccount> {
  switch (request.kind) {
    case INPUT_KINDS.username: {
      const account = await connectAccount(request.source, request.username);
      const remembered: RememberedAccount = {
        accountId: account.id,
        platform: account.platform,
        username: account.username,
      };

      useMyAccounts.getState().remember(remembered);
      return remembered;
    }
  }
}

/** Whether this browser has an account selected — a UI question, not identity (that's the server session, see `auth/session.ts`). */
export type ImportStatus = "ready" | "empty";

export function importStatus(remembered: RememberedAccount[]): ImportStatus {
  return remembered.length > 0 ? "ready" : "empty";
}

/** How often an active sync job is asked for its status. */
const SYNC_POLL_MS = 3_000;

type SyncJob = InferResponseType<(typeof api.syncs)[":id"]["$get"], 200>;

const ACTIVE_SYNC = new Set<SyncJob["status"]>(["queued", "running", "retrying"]);

/** One sync job, polled while it can still change. Its id comes from the
 * server — a `202` or an account's `activeSyncId` — so a reload resumes. */
function syncJobQuery(syncId: string) {
  return queryOptions({
    queryKey: ["syncs", syncId],
    queryFn: () => parseResponse(api.syncs[":id"].$get({ param: { id: syncId } })),
    // A settled job never changes again; a failed read stops too, and the
    // query client's own retry rule decides whether it was worth a retry.
    refetchInterval: (query) =>
      query.state.status !== "error" && isSyncActive(query.state.data)
        ? SYNC_POLL_MS
        : false,
  });
}

function isSyncActive(job: SyncJob | undefined): boolean {
  return job === undefined || ACTIVE_SYNC.has(job.status);
}

/**
 * Follows sync jobs until each settles, then refreshes what a sync can
 * change — the library and the accounts — and nothing else.
 */
export function useSyncJobs(syncIds: readonly string[]) {
  const queryClient = useQueryClient();
  const jobs = useQueries({ queries: syncIds.map(syncJobQuery) });
  const settled = jobs.filter((job) => job.isError || !isSyncActive(job.data)).length;

  useEffect(() => {
    if (settled === 0) return;
    void queryClient.invalidateQueries({ queryKey: ["games"] });
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
  }, [settled, queryClient]);

  return { jobs, done: syncIds.length > 0 && settled === syncIds.length };
}

/**
 * `refreshed` sums the accounts that synced; `too-soon` covers the ones
 * still cooling down. A batch can report both: "0 new games" for an
 * account that never started would be a different, wrong story.
 */
export type SyncOutcome =
  | { status: "refreshed"; saved: number }
  | { status: "too-soon"; retryAfterSeconds: number };

/** Asks the server to sync, then follows the jobs to an outcome. Server
 * ids, never the device's remembered ones: a browser can hold an id from
 * a database that no longer exists, and syncing it 404s forever. */
export function useSyncGames(handlers: {
  onOutcome: (outcome: SyncOutcome) => void;
  onError: () => void;
}) {
  const [syncIds, setSyncIds] = useState<string[]>([]);
  const { jobs, done } = useSyncJobs(syncIds);

  const request = useMutation({
    // Parallel: the server only schedules, so one account's cooldown
    // never holds back the others.
    mutationFn: (accounts: readonly { id: string }[]) =>
      Promise.all(accounts.map((account) => requestSync(account.id))),
    // Cooldowns are reported now, while their wait is exact; the started
    // jobs report when they settle.
    onSuccess: (results) => {
      const started = results.flatMap((result) =>
        "syncId" in result ? [result.syncId] : [],
      );
      const waits = results.flatMap((result) =>
        "retryAfterSeconds" in result ? [result.retryAfterSeconds] : [],
      );
      if (waits.length > 0) {
        handlers.onOutcome({ status: "too-soon", retryAfterSeconds: Math.min(...waits) });
      }
      if (started.length > 0) setSyncIds(started);
    },
    onError: handlers.onError,
  });

  const report = useEffectEvent(() => {
    if (jobs.some((job) => job.isError || job.data?.status === "failed")) {
      handlers.onError();
      return;
    }
    const saved = jobs.reduce(
      (sum, job) => sum + (job.data?.progress.gamesInserted ?? 0),
      0,
    );
    handlers.onOutcome({ status: "refreshed", saved });
  });
  // Once per batch: `done` turns true when its last job settles.
  useEffect(() => {
    if (done) report();
  }, [done]);

  return {
    mutate: request.mutate,
    isPending: request.isPending || (syncIds.length > 0 && !done),
  };
}

/** A sync request: the job it started, or how long the cooldown has left. */
async function requestSync(accountId: string) {
  try {
    return await parseResponse(
      api.accounts[":id"].sync.$post({ param: { id: accountId } }),
    );
  } catch (error) {
    // Either throttle — the domain cooldown or the API rate limit —
    // arrives as the same class with the same wait. A 429 that somehow
    // carried no wait falls back to the cooldown's own window.
    if (isRateLimitedError(error))
      return { retryAfterSeconds: error.retryAfterSeconds ?? 60 };
    throw error;
  }
}

/** Named so a caller that owns the surrounding frame — the onboarding
 * dialog — can ask whether an import is in flight without the form
 * threading it up. */
export const IMPORT_MUTATION_KEY = ["import-games"] as const;

export function useImportGames() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: IMPORT_MUTATION_KEY,
    mutationFn: importArchive,
    // Awaited before mutateAsync resolves, so the screen navigates into
    // a warm cache and past a guard that already knows the account.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/** Stops tracking an account. The server deletes the games it imported
 * along with it, so the blanket invalidation below is load-bearing: the
 * library and every per-account read go stale at the same moment the
 * connection does. */
export function useDisconnectAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) =>
      parseResponse(api.accounts[":id"].$delete({ param: { id: accountId } })),
    onSuccess: (_, accountId) => {
      useMyAccounts.getState().forget(accountId);
      return queryClient.invalidateQueries();
    },
  });
}
