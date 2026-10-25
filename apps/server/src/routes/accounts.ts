import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  disconnectAccount,
  importAccount,
  listAccounts,
  listGamesWithStatus,
  requestSync,
  syncAllAccounts,
} from "@velachess/accounts";
import type {
  ConnectAccountDeps,
  DisconnectAccountDeps,
  ListAccountGamesDeps,
  ListAccountsDeps,
  RequestSyncDeps,
  SyncAllAccountsDeps,
} from "@velachess/accounts";

import type { ApiEnv } from "../server.ts";
import {
  defaultHook,
  errorResponseSchema,
  idParamSchema,
  wireDateOrNull,
} from "../validation.ts";

const ACCOUNT_CONNECT_STATUS = {
  CONNECTED: "connected",
  PROVIDER_CONNECTED: "provider-connected",
  NOT_FOUND: "not-found",
  UNAVAILABLE: "unavailable",
} as const;

const ACCOUNT_SYNC_STATUS = {
  NOT_FOUND: "not-found",
  TOO_SOON: "too-soon",
  ACCEPTED: "accepted",
} as const;

const ACCOUNT_DISCONNECT_STATUS = {
  NOT_FOUND: "not-found",
  DELETED: "deleted",
} as const;

const ACCOUNT_NOT_FOUND_ERROR = "account not found";

/** Mirrors `@velachess/infra-platforms`' `accountPlatformSchema`, which
 * `routes-no-direct-infra` forbids importing; guarded by
 * `apps/server/tests/contracts.test.ts`. */
export const ACCOUNT_PLATFORM = ["chess_com", "lichess"] as const;
/** Guarded alongside `ACCOUNT_PLATFORM`. */
export const SYNC_JOB_ERROR = ["not-found", "incomplete", "internal"] as const;

const createAccountSchema = z.object({
  platform: z.enum(ACCOUNT_PLATFORM),
  username: z.string().min(1),
});

/** `platform` is the literal union, not `z.string()`: a plain string
 * widens the RPC client's `account.platform` and breaks `apps/web`'s
 * `SourceId`-typed callers. */
const accountSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(ACCOUNT_PLATFORM),
  username: z.string(),
  syncId: z
    .string()
    .uuid()
    .nullable()
    .describe("The first sync job; null when the handle was already tracked"),
});

/** Carries the existing connection's identity, so the client can point at
 * the handle it refused to overwrite. */
const providerConflictSchema = errorResponseSchema.extend({
  platform: z.enum(ACCOUNT_PLATFORM),
  username: z.string(),
  accountId: z.string().uuid(),
});

const createAccountRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Track a chess.com or Lichess account",
  description:
    "Confirms the handle with one provider request, then creates the account and schedules its first sync together; the archive is fetched in the background. At most one account per provider per user. Reconnecting the same handle is an idempotent no-op; a different handle on a platform already tracked answers 409 with the existing connection's identity.",
  request: {
    body: {
      content: { "application/json": { schema: createAccountSchema } },
    },
  },
  responses: {
    201: {
      description: "Account tracked, first sync scheduled",
      content: { "application/json": { schema: accountSchema } },
    },
    404: {
      description: "The provider has no such handle; no account was created",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "This provider is already connected to a different handle",
      content: { "application/json": { schema: providerConflictSchema } },
    },
    503: {
      description: "The provider could not confirm the handle; no account was created",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

/** `lastSyncedAt` travels as ISO text, not a `Date`. */
const trackedAccountSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(ACCOUNT_PLATFORM),
  username: z.string(),
  lastSyncedAt: z.string().nullable(),
  syncStatus: z
    .enum(["queued", "running", "retrying", "idle"])
    .describe("The active sync job's status, or idle when none is active"),
  activeSyncId: z.string().uuid().nullable(),
  lastSyncError: z
    .enum(SYNC_JOB_ERROR)
    .nullable()
    .describe("Why the newest job failed; cleared by the next success"),
});

/** Only the timestamp is restated, so the rest cannot drift; see
 * `wireDate`. */
const trackedAccountWire = trackedAccountSchema.extend({
  lastSyncedAt: wireDateOrNull,
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

const syncAcceptedSchema = z.object({
  syncId: z.string().uuid(),
  status: z.enum(["queued", "running", "retrying", "succeeded", "failed"]),
});

const rateLimitedSchema = errorResponseSchema.extend({
  retryAfterSeconds: z.number().int(),
});

const syncAllAcceptedSchema = z.object({
  syncIds: z.array(z.string().uuid()),
});

const syncAllAccountsRoute = createRoute({
  method: "post",
  path: "/sync",
  summary: "Schedule a sync of every account this user tracks",
  description:
    "One request for every tracked account: a cooldown or an already-active job on one of them is folded in silently, so this answers only the jobs actually now in flight. An empty list is a valid answer — there is nothing new to watch. Follow each id with GET /syncs/{id} or the SSE stream.",
  responses: {
    202: {
      description: "Every job now in flight for this user, new or already running",
      content: { "application/json": { schema: syncAllAcceptedSchema } },
    },
  },
});

const syncAccountRoute = createRoute({
  method: "post",
  path: "/{id}/sync",
  summary: "Schedule a sync of this account",
  description:
    "Records a sync job and queues it; the worker fetches and persists the archive. A request while a job is active returns that job. Follow it with GET /syncs/{id}. No engine runs — analysis is triggered by opening a game. Rate limited per account; 429 carries Retry-After.",
  request: { params: idParamSchema },
  responses: {
    202: {
      description: "Sync scheduled, or the one already active",
      content: { "application/json": { schema: syncAcceptedSchema } },
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

/** `playedAt` travels as ISO text, not a `Date`. */
const accountGameSchema = z.object({
  id: z.string().uuid(),
  whiteName: z.string(),
  blackName: z.string(),
  result: z.string(),
  playedAt: z.string().nullable(),
  perspective: z.string().nullable(),
  openingName: z.string().nullable(),
});

const accountGameWire = accountGameSchema.extend({ playedAt: wireDateOrNull });

const accountGamesRoute = createRoute({
  method: "get",
  path: "/{id}/games",
  summary: "Games this account imported",
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

const deleteAccountRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Stop tracking an account",
  description:
    "Owner-scoped and permanent. The games this account imported are deleted with it; manually imported PGNs, which have no account, are untouched. Deleting frees that provider slot: the user can reconnect it, same or different handle, right after.",
  request: { params: idParamSchema },
  responses: {
    204: { description: "Removed" },
    404: {
      description: "Unknown account",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

export interface AccountsRouteDeps {
  list: ListAccountsDeps;
  games: ListAccountGamesDeps;
  connect: ConnectAccountDeps;
  sync: RequestSyncDeps;
  syncAll: SyncAllAccountsDeps;
  disconnect: DisconnectAccountDeps;
}

export function accountsRoutes(deps: AccountsRouteDeps) {
  return (
    new OpenAPIHono<ApiEnv>({ defaultHook })
      // The only place a connection is created: a GET that upserts the
      // account can seize it, which is how one user's archive once
      // transferred to another.
      .openapi(createAccountRoute, async (c) => {
        const { platform, username } = c.req.valid("json");
        const outcome = await importAccount(
          deps.connect,
          c.get("userId"),
          platform,
          username,
        );

        if (outcome.status === ACCOUNT_CONNECT_STATUS.PROVIDER_CONNECTED) {
          return c.json(
            {
              error: "provider already connected",
              platform: outcome.existing.platform,
              username: outcome.existing.username,
              accountId: outcome.existing.id,
            },
            409,
          );
        }
        if (outcome.status === ACCOUNT_CONNECT_STATUS.NOT_FOUND)
          return c.json({ error: "handle not found at the provider" }, 404);
        if (outcome.status === ACCOUNT_CONNECT_STATUS.UNAVAILABLE)
          return c.json({ error: "provider unavailable, try again" }, 503);

        return c.json(
          {
            id: outcome.account.id,
            platform: outcome.account.platform,
            username: outcome.account.username,
            syncId: outcome.syncId,
          },
          201,
        );
      })
      // Sync state travels with each account: `lastSyncedAt` says a pass
      // finished, `syncStatus` says whether one is still coming. A client that
      // saw only the timestamp couldn't tell "syncing" from "gave up".
      .openapi(listAccountsRoute, async (c) => {
        const accounts = await listAccounts(deps.list, c.get("userId"));
        return c.json(
          accounts.map((account) => trackedAccountWire.parse(account)),
          200,
        );
      })
      .openapi(syncAllAccountsRoute, async (c) => {
        const { syncIds } = await syncAllAccounts(deps.syncAll, c.get("userId"));
        return c.json({ syncIds }, 202);
      })
      .openapi(syncAccountRoute, async (c) => {
        const outcome = await requestSync(
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

        return c.json({ syncId: outcome.job.id, status: outcome.job.status }, 202);
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
          games.map((game) => accountGameWire.parse(game)),
          200,
        );
      })
      // Permanent, owner-scoped, and it takes the account's games with
      // it — a library still showing a disconnected account's games is
      // what this answers.
      .openapi(deleteAccountRoute, async (c) => {
        const outcome = await disconnectAccount(
          deps.disconnect,
          c.get("userId"),
          c.req.valid("param").id,
        );

        if (outcome.status === ACCOUNT_DISCONNECT_STATUS.NOT_FOUND)
          return c.json({ error: ACCOUNT_NOT_FOUND_ERROR }, 404);

        return c.body(null, 204);
      })
  );
}
