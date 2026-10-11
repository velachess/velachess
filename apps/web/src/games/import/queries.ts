import {
  api,
  isRateLimitedError,
  parseResponse,
  type InferResponseType,
} from "../../api/index.ts";
import { sessionQueryKey } from "../../auth/session.ts";
import {
  QueryObserver,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClientType,
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

/** The statuses a sync can still leave, whether read off a job or an account. */
const ACTIVE_SYNC = new Set<SyncJob["status"] | TrackedAccount["syncStatus"]>([
  "queued",
  "running",
  "retrying",
]);

export function isSyncActive(status: SyncJob["status"] | TrackedAccount["syncStatus"]) {
  return ACTIVE_SYNC.has(status);
}

function isSettled(job: SyncJob | undefined): job is SyncJob {
  return job !== undefined && !isSyncActive(job.status);
}

/**
 * One sync job, polled while it can still change. Its id comes from the
 * server — a `202` or an account's `activeSyncId` — so a reload resumes.
 * Settling is when a sync's writes become visible, so the query that learns
 * it refreshes the library and the accounts; a settled job is never fetched
 * again, which makes that refresh happen once per job.
 */
export function syncJobQuery(syncId: string) {
  return queryOptions({
    queryKey: ["syncs", syncId],
    queryFn: async ({ client }) => {
      const job = await parseResponse(api.syncs[":id"].$get({ param: { id: syncId } }));
      if (isSettled(job)) {
        await Promise.all([
          client.invalidateQueries({ queryKey: ["games"] }),
          client.invalidateQueries({ queryKey: trackedAccountsQuery.queryKey }),
        ]);
      }
      return job;
    },
    staleTime: (query) => (isSettled(query.state.data) ? Infinity : 0),
    // A failed read stops too; the query client's retry rule already decided.
    refetchInterval: (query) =>
      query.state.status === "error" || isSettled(query.state.data)
        ? false
        : SYNC_POLL_MS,
  });
}

/** The job once it settles. The observer's `refetchInterval` does the polling. */
function settledSync(client: QueryClientType, syncId: string): Promise<SyncJob> {
  const observer = new QueryObserver(client, syncJobQuery(syncId));
  return new Promise((resolve, reject) => {
    const unsubscribe = observer.subscribe((result) => {
      if (result.isError) {
        unsubscribe();
        reject(result.error);
      } else if (isSettled(result.data)) {
        unsubscribe();
        resolve(result.data);
      }
    });
  });
}

export const SYNC_OUTCOME = {
  refreshed: "refreshed",
  tooSoon: "too-soon",
} as const;

/**
 * `refreshed` sums the jobs that settled; `too-soon` covers the accounts
 * still cooling down. A batch can report both: "0 new games" for an account
 * that never started would be a different, wrong story.
 */
export type SyncOutcome =
  | { status: typeof SYNC_OUTCOME.refreshed; saved: number }
  | { status: typeof SYNC_OUTCOME.tooSoon; retryAfterSeconds: number };

/**
 * Asks the server to sync, then follows the jobs to one outcome per batch.
 * Server ids, never the device's remembered ones: a browser can hold an id
 * from a database that no longer exists, and syncing it 404s forever. A
 * failed job fails the batch, whatever the others brought.
 */
export function useSyncGames(handlers: {
  onOutcome: (outcome: SyncOutcome) => void;
  onError: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accounts: readonly { id: string }[]) => {
      // Parallel: the server only schedules, so one account's cooldown
      // never holds back the others.
      const answers = await Promise.all(
        accounts.map((account) => requestSync(account.id)),
      );
      const waits = answers.flatMap((answer) =>
        "retryAfterSeconds" in answer ? [answer.retryAfterSeconds] : [],
      );
      // Reported now, while the wait is exact.
      if (waits.length > 0) {
        handlers.onOutcome({
          status: SYNC_OUTCOME.tooSoon,
          retryAfterSeconds: Math.min(...waits),
        });
      }
      return Promise.all(
        answers.flatMap((answer) =>
          "syncId" in answer ? [settledSync(queryClient, answer.syncId)] : [],
        ),
      );
    },
    onSuccess: (jobs) => {
      if (jobs.length === 0) return;
      if (jobs.some((job) => job.status === "failed")) {
        handlers.onError();
        return;
      }
      const saved = jobs.reduce((sum, job) => sum + (job.progress.gamesInserted ?? 0), 0);
      handlers.onOutcome({ status: SYNC_OUTCOME.refreshed, saved });
    },
    // Requests that went through before the failure may have started jobs:
    // the accounts list them, so following them survives this batch.
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: trackedAccountsQuery.queryKey });
      handlers.onError();
    },
  });
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
    // Connecting adds an account, schedules its first sync and ends
    // onboarding. Awaited before mutateAsync resolves, so the screen
    // navigates into a warm cache and past a guard that already knows both.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trackedAccountsQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
      ]),
  });
}

/** Stops tracking an account. The server deletes the games it imported,
 * and their analyses with them, so those reads go stale with the account. */
export function useDisconnectAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) =>
      parseResponse(api.accounts[":id"].$delete({ param: { id: accountId } })),
    onSuccess: (_, accountId) => {
      useMyAccounts.getState().forget(accountId);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: trackedAccountsQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: ["games"] }),
        queryClient.invalidateQueries({ queryKey: ["game"] }),
      ]);
    },
  });
}
