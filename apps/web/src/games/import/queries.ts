import {
  api,
  isRateLimitedError,
  parseResponse,
  type InferResponseType,
} from "../../api/index.ts";
import { sessionQueryKey } from "../../auth/session.ts";
import { queryOptions, useMutation, useQueryClient } from "../../libs/react-query.ts";
import { gamesQueryKey } from "../list/queries.ts";
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

/** The statuses an account's sync can still leave. A settled one reads
 * `idle` here: the stream (`sync-events.ts`) is what announces the change. */
const ACTIVE_SYNC = new Set<TrackedAccount["syncStatus"]>([
  "queued",
  "running",
  "retrying",
]);

export function isSyncActive(status: TrackedAccount["syncStatus"]) {
  return ACTIVE_SYNC.has(status);
}

/**
 * Asks the server to sync and stops there: the worker runs the jobs, the
 * accounts list them as active, and the sync stream says when they land.
 * Server ids, never the device's remembered ones: a browser can hold an id
 * from a database that no longer exists, and syncing it 404s forever.
 */
export function useSyncGames(handlers: {
  /** The shortest wait among the accounts still cooling down. */
  onTooSoon: (retryAfterSeconds: number) => void;
  onError: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    // Parallel, and a cooldown is an answer rather than a rejection: one
    // account's 429 never discards the jobs the others started.
    mutationFn: (accounts: readonly { id: string }[]) =>
      Promise.all(accounts.map((account) => requestSync(account.id))),
    onSuccess: (answers) => {
      const waits = answers.flatMap((answer) =>
        "retryAfterSeconds" in answer ? [answer.retryAfterSeconds] : [],
      );
      if (waits.length > 0) handlers.onTooSoon(Math.min(...waits));
    },
    onError: handlers.onError,
    // Whatever went through is a job the accounts now list as active —
    // including the ones started before a failure.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: trackedAccountsQuery.queryKey }),
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
        queryClient.invalidateQueries({ queryKey: gamesQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["game"] }),
      ]);
    },
  });
}
