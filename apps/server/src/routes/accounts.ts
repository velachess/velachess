import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  importAccount,
  listAccounts,
  listGamesWithStatus,
  refreshAccount,
} from "@velachess/accounts";
import type {
  ConnectAccountDeps,
  ListAccountGamesDeps,
  ListAccountsDeps,
  SyncAccountDeps,
} from "@velachess/accounts";

import type { ApiEnv } from "../server.ts";
import { defaultHook, errorResponseSchema, idParamSchema } from "../validation.ts";

/** `@velachess/accounts`' `RefreshOutcome.status` vocabulary — local to
 * this file, the only one that branches on it. */
const ACCOUNT_SYNC_STATUS = {
  NOT_FOUND: "not-found",
  TOO_SOON: "too-soon",
  REFRESHED: "refreshed",
} as const;

/** Repeated across both this file's 404s — one place to change the wording. */
const ACCOUNT_NOT_FOUND_ERROR = "account not found";

const createAccountSchema = z.object({
  platform: z.enum(["chess_com", "lichess"]),
  username: z.string().min(1),
});

/** What `POST /` actually returns — a narrowed projection of the account
 * row, not the row itself. `platform` mirrors `@velachess/accounts`'
 * `Platform` union exactly (was `z.string()` at first — a plain string
 * widened the RPC client's `account.platform` from a literal union to
 * `string`, breaking `apps/web`'s `SourceId`-typed callers; caught by the
 * RPC typecheck gate, fixed here). */
const accountSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(["chess_com", "lichess"]),
  username: z.string(),
});

const createAccountRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Track a chess.com or Lichess account",
  request: {
    body: {
      content: { "application/json": { schema: createAccountSchema } },
    },
  },
  responses: {
    201: {
      description: "Account tracked (idempotent upsert)",
      content: { "application/json": { schema: accountSchema } },
    },
  },
});

/** Mirrors `@velachess/accounts`' `TrackedAccountSummary & { syncState }` —
 * `lastSyncedAt` travels as ISO text on the wire, not a `Date`. */
const trackedAccountSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(["chess_com", "lichess"]),
  username: z.string(),
  lastSyncedAt: z.string().nullable(),
  syncState: z
    .enum(["queued", "active", "failed", "none"])
    .describe("Delivery state of the newest non-completed sync job"),
});

const listAccountsRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List the accounts this user tracks",
  responses: {
    200: {
      description: "Tracked accounts, oldest first",
      content: { "application/json": { schema: z.array(trackedAccountSchema) } },
    },
  },
});

const syncOutcomeSchema = z.object({
  saved: z.number().int().describe("Games new to the archive"),
  judged: z.number().int(),
  seeded: z.number().int(),
});

const rateLimitedSchema = errorResponseSchema.extend({
  retryAfterSeconds: z.number().int(),
});

const syncAccountRoute = createRoute({
  method: "post",
  path: "/{id}/sync",
  summary: "Pull what's new for this account",
  description:
    "Interactive and synchronous: fetch, judge the new games against the repertoire, seed the exercises their severities allow, and report what changed. No engine runs — analysis is triggered by opening a game. Rate limited per account; 429 carries Retry-After.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "What the refresh changed",
      content: { "application/json": { schema: syncOutcomeSchema } },
    },
    404: {
      description: "Unknown account",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    429: {
      description: "Synced too recently — Retry-After says when",
      content: { "application/json": { schema: rateLimitedSchema } },
    },
  },
});

/** Mirrors `@velachess/accounts`' `GameWithStatus` — `playedAt` travels as
 * ISO text on the wire, not a `Date`. */
const accountGameSchema = z.object({
  id: z.string().uuid(),
  whiteName: z.string(),
  blackName: z.string(),
  result: z.string(),
  playedAt: z.string().nullable(),
  perspective: z.string().nullable(),
  openingName: z.string().nullable(),
  judgmentType: z.string().nullable(),
  judgmentPly: z.number().int().nullable(),
  analyzed: z.boolean(),
});

const accountGamesRoute = createRoute({
  method: "get",
  path: "/{id}/games",
  summary: "Games of the account with judgment and analysis status",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Game list (no PGN payloads)",
      content: { "application/json": { schema: z.array(accountGameSchema) } },
    },
    404: {
      description: "Unknown account",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

/** Narrow composed deps for this module's four slices — one field per
 * route, built by `apps/server/src/composition/accounts.ts`. */
export interface AccountsRouteDeps {
  list: ListAccountsDeps;
  games: ListAccountGamesDeps;
  connect: ConnectAccountDeps;
  sync: SyncAccountDeps;
}

export function accountsRoutes(deps: AccountsRouteDeps) {
  return (
    new OpenAPIHono<ApiEnv>({ defaultHook })
      // Importing is a POST, and the only place a connection is created.
      // Reads stopped writing ownership: the old flow let GET /games
      // upsert the account and seize it, which is how one user's archive
      // transferred to another. First contact also fills the archive, so
      // a bad username fails here, in front of the person who typed it.
      .openapi(createAccountRoute, async (c) => {
        const { platform, username } = c.req.valid("json");
        const account = await importAccount(
          deps.connect,
          c.get("userId"),
          platform,
          username,
        );
        return c.json(
          {
            id: account.id,
            platform: account.platform,
            username: account.username,
          },
          201,
        );
      })
      // Delivery state travels with each account: `lastSyncedAt` says a pass
      // finished, `syncState` says whether one is still coming. A client that
      // saw only the timestamp couldn't tell "syncing" from "gave up".
      .openapi(listAccountsRoute, async (c) => {
        const accounts = await listAccounts(deps.list, c.get("userId"));
        return c.json(
          accounts.map((account) =>
            Object.assign({}, account, {
              lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
            }),
          ),
          200,
        );
      })
      // Interactive and synchronous, like importing: someone waiting on a
      // button needs an answer, and "nothing new" is an answer. The queue
      // stays for refreshes nobody is watching.
      .openapi(syncAccountRoute, async (c) => {
        const outcome = await refreshAccount(
          deps.sync,
          c.get("userId"),
          c.req.valid("param").id,
        );

        if (outcome.status === ACCOUNT_SYNC_STATUS.NOT_FOUND)
          return c.json({ error: ACCOUNT_NOT_FOUND_ERROR }, 404);
        if (outcome.status === ACCOUNT_SYNC_STATUS.TOO_SOON) {
          // Retry-After is the header the status code is defined with; the
          // body repeats it so a client needn't read headers to show a countdown.
          c.header("Retry-After", String(outcome.retryAfterSeconds));
          return c.json(
            {
              error: "synced too recently",
              retryAfterSeconds: outcome.retryAfterSeconds,
            },
            429,
          );
        }

        return c.json(
          {
            saved: outcome.saved,
            judged: outcome.judged,
            seeded: outcome.seeded,
          },
          200,
        );
      })
      .openapi(accountGamesRoute, async (c) => {
        // Scoped lookup lives in the slice now: someone else's account id
        // 404s exactly like a missing one, so this route never confirms
        // which uuids exist.
        const games = await listGamesWithStatus(
          deps.games,
          c.get("userId"),
          c.req.valid("param").id,
        );
        if (!games) return c.json({ error: ACCOUNT_NOT_FOUND_ERROR }, 404);
        return c.json(
          games.map((game) =>
            Object.assign({}, game, { playedAt: game.playedAt?.toISOString() ?? null }),
          ),
          200,
        );
      })
  );
}
