import {
  api,
  DetailedError,
  parseResponse,
  type InferResponseType,
} from "../../shared/api/client.ts";
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "../../shared/libs/query/index.ts";
import { z } from "../../shared/libs/zod.ts";
import { useMyAccounts, type RememberedAccount } from "./my-accounts.ts";
import { INPUT_KINDS, type SourceId } from "./sources.ts";

export type TrackedAccount = InferResponseType<typeof api.accounts.$get, 200>[number];

/** Lichess serves its flairs from one public asset directory keyed by the
 * id the API reports (`people.santa-claus` → `<dir>/people.santa-claus.svg`).
 * Only the id crosses the API; the address is presentation. */
const LICHESS_FLAIR_ASSETS = "https://lichess1.org/assets/flair/img";

export function flairImageOf(flair: string): string {
  return `${LICHESS_FLAIR_ASSETS}/${flair}.svg`;
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

/**
 * Summed over the device's accounts. `too-soon` wins: nothing was
 * pulled, and "0 new games" would be a different, wrong story.
 */
export type SyncOutcome =
  | { status: "refreshed"; saved: number }
  | { status: "too-soon"; retryAfterSeconds: number };

const tooSoonSchema = z.object({ retryAfterSeconds: z.number() });

/** Pulls fresh games for every account the server tracks. Server ids,
 * never the device's remembered ones: a browser can hold an id from a
 * database that no longer exists, and syncing it 404s forever. */
export function useSyncGames(handlers: {
  onOutcome: (outcome: SyncOutcome) => void;
  onError: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accounts: readonly { id: string }[]): Promise<SyncOutcome> => {
      let saved = 0;

      for (const account of accounts) {
        // Sequential: a 429 must stop the loop before the next account
        // is requested, so these can't run in Promise.all.
        // oxlint-disable-next-line eslint/no-await-in-loop
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop
          const result = await parseResponse(
            api.accounts[":id"].sync.$post({
              param: { id: account.id },
            }),
          );
          saved += result.saved;
        } catch (error) {
          if (error instanceof DetailedError && error.statusCode === 429) {
            const tooSoon = tooSoonSchema.safeParse(error.detail?.data);
            if (tooSoon.success) {
              return {
                status: "too-soon",
                retryAfterSeconds: tooSoon.data.retryAfterSeconds,
              };
            }
          }
          throw error;
        }
      }

      return { status: "refreshed", saved };
    },
    onSuccess: (outcome) => {
      handlers.onOutcome(outcome);
      return queryClient.invalidateQueries();
    },
    onError: handlers.onError,
  });
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
