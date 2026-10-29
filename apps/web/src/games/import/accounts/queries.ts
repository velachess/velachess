import { msg } from "@lingui/core/macro";

import {
  api,
  isRateLimitedError,
  parseResponse,
  type InferResponseType,
} from "../../../api/index.ts";
import { sessionQueryKey } from "../../../auth/session.ts";
import { queryOptions, useMutation, useQueryClient } from "../../../libs/react-query.ts";
import { gameQueryKey, gamesQueryKey } from "../../game-query-keys.ts";
import { useMyAccounts, type RememberedAccount } from "./my-accounts.ts";
import { INPUT_KINDS, type SourceId } from "./sources.ts";

export type TrackedAccount = InferResponseType<typeof api.accounts.$get, 200>[number];

/** The wait is what makes a cooldown actionable, and it is the server's
 * number: declared once, since both surfaces that can be refused show it. */
export const SYNC_RETRY_IN = msg`{seconds, plural, one {Try again in # second.} other {Try again in # seconds.}}`;

/** Lichess serves flairs from one public directory keyed by the id its API
 * reports (`people.santa-claus` → `<dir>/people.santa-claus.webp`). */
const LICHESS_FLAIR_ASSETS = "https://lichess1.org/assets/flair/img";

export function flairImageOf(flair: string): string {
  return `${LICHESS_FLAIR_ASSETS}/${flair}.webp`;
}

/** Per the server, not localStorage's `my-accounts`: a new machine or a
 * rebuilt database desyncs from local memory. */
export const trackedAccountsQuery = queryOptions({
  queryKey: ["accounts"],
  queryFn: () => parseResponse(api.accounts.$get()),
});

export type ImportRequest = {
  kind: typeof INPUT_KINDS.username;
  source: SourceId;
  username: string;
};

async function connectAccount(platform: SourceId, username: string) {
  return parseResponse(api.accounts.$post({ json: { platform, username } }));
}

/** Remembers the server's returned username rather than the typed one,
 * which the platforms normalise. */
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

/** A UI question, not identity, which is the server session's. */
export type ImportStatus = "ready" | "empty";

export function importStatus(remembered: RememberedAccount[]): ImportStatus {
  return remembered.length > 0 ? "ready" : "empty";
}

/** Mirrors the server's `ACTIVE_SYNC_STATUSES`: every other status is a
 * sync that is over, or an account that never had one. */
const ACTIVE_SYNC = new Set<TrackedAccount["syncStatus"]>([
  "queued",
  "running",
  "retrying",
]);

/** Takes an absent status, so a caller comparing against what it saw last
 * needs no guard of its own. */
export function isSyncActive(status: TrackedAccount["syncStatus"] | undefined) {
  return status !== undefined && ACTIVE_SYNC.has(status);
}

/** The backend folds in per-account cooldowns and active jobs silently;
 * only this route's own rate limit surfaces as `onTooSoon`. */
export function useSyncGames(handlers: {
  onTooSoon: (retryAfterSeconds: number | null) => void;
  onError: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        return await parseResponse(api.accounts.sync.$post());
      } catch (error) {
        if (isRateLimitedError(error))
          return { syncIds: [], retryAfterSeconds: error.retryAfterSeconds };
        throw error;
      }
    },
    onSuccess: (answer) => {
      if ("retryAfterSeconds" in answer) handlers.onTooSoon(answer.retryAfterSeconds);
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
  onTooSoon: (retryAfterSeconds: number | null) => void;
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
    // Either throttle — the domain cooldown or the API rate limit — arrives
    // as the same class with the same wait.
    if (isRateLimitedError(error)) return { retryAfterSeconds: error.retryAfterSeconds };
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
        queryClient.invalidateQueries({ queryKey: gameQueryKey }),
      ]);
    },
  });
}
