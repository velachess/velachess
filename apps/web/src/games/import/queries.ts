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

/** The spinner condition both sync buttons share: the request itself still
 * in flight, or the server already holding an active job for any of the
 * accounts this button covers. */
export function isSyncInProgress(
  isPending: boolean,
  accounts: readonly Pick<TrackedAccount, "syncStatus">[],
): boolean {
  return isPending || accounts.some((account) => isSyncActive(account.syncStatus));
}

/**
 * Asks the server to sync every tracked account and stops there — which
 * accounts exist, their cooldowns, and any already-active job are the
 * backend's to fold together; this button only reacts to the ids it hands
 * back, via `useSyncSettlementToast`.
 */
export function useSyncGames(handlers: { onError: () => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        return await parseResponse(api.accounts.sync.$post());
      } catch (error) {
        // The same "nothing new to watch" the backend already answers for
        // a cooling-down account — this is the API's own burst limit
        // saying the same thing one layer up, so it gets the same silence.
        if (isRateLimitedError(error)) return { syncIds: [] };
        throw error;
      }
    },
    onError: handlers.onError,
    // Whatever's now in flight is a job the accounts list as active.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: trackedAccountsQuery.queryKey }),
  });
}

/**
 * Asks the server to sync one account. Server ids, never the device's
 * remembered ones: a browser can hold an id from a database that no longer
 * exists, and syncing it 404s forever.
 */
export function useSyncAccount(handlers: {
  onTooSoon: (retryAfterSeconds: number) => void;
  onError: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: string) => requestSync(accountId),
    onSuccess: (answer) => {
      if ("retryAfterSeconds" in answer) handlers.onTooSoon(answer.retryAfterSeconds);
    },
    onError: handlers.onError,
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
