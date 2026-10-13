import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  getGameForReview,
  importPgnForUser,
  openLibrary,
  type GetGameDeps,
  type ImportPgnDeps,
  type ListGamesDeps,
} from "@velachess/games";

import type { ApiEnv } from "../server.ts";
import {
  defaultHook,
  errorResponseSchema,
  idParamSchema,
  wireDate,
  wireDateOrNull,
} from "../validation.ts";

/** The largest page worth answering in one round trip. */
const MAX_PAGE_SIZE = 100;

const libraryQuery = z.object({
  color: z
    .enum(["white", "black"])
    .optional()
    .describe("Which side you played, resolved per game"),
  outcome: z
    .enum(["win", "loss", "draw"])
    .optional()
    .describe("From the player's side, not the scoresheet's"),
  timeClass: z
    .enum(["bullet", "blitz", "rapid", "classical"])
    .optional()
    .describe("Bucketed by estimated duration (initial + 40 × increment)"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
});

/**
 * How the uploader is identified across the batch: forced White or Black
 * for every game, or by name against each game's own headers. Optional at
 * the API: without it, games still land, just unattributed.
 */
const participationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("white") }),
  z.object({ mode: z.literal("black") }),
  z.object({
    mode: z.literal("byName"),
    playerName: z.string().trim().min(1).max(128),
  }),
]);

const importPgnSchema = z.object({
  pgn: z.string().min(1).describe("One or more games in PGN format"),
  participation: participationSchema
    .optional()
    .describe("How the uploader is identified across the batch"),
});

/** Mirrors `@velachess/infra-platforms`' `resultSchema`, `perspectiveSchema`
 * and `gameSourceSchema` — `routes-no-direct-infra` forbids importing them,
 * so this file keeps one hand-written copy of each; guarded by
 * `apps/server/tests/contracts.test.ts`. */
export const GAME_RESULT = ["1-0", "0-1", "1/2-1/2", "*"] as const;
export const GAME_PERSPECTIVE = ["white", "black"] as const;
export const GAME_SOURCE = ["chess_com", "lichess", "pgn"] as const;

/**
 * Mirrors the `.select({...})` projection in
 * `libs/infra/db/queries/status.ts`'s `listGamesPage` — inferred from a
 * Drizzle query, never a declared interface, so this is the one place
 * that shape is written out by hand. `apps/web`'s games-list table reads
 * these fields directly (caught by the RPC typecheck gate, same lesson
 * as `/games/{id}`), so a loose record isn't an option
 * here either. `playedAt` travels as ISO text on the wire, not a `Date`.
 */
const gameListRowSchema = z.object({
  id: z.string().uuid(),
  whiteName: z.string(),
  whiteRating: z.number().int().nullable(),
  blackName: z.string(),
  blackRating: z.number().int().nullable(),
  result: z.enum(GAME_RESULT),
  playedAt: z.string().nullable(),
  perspective: z.enum(GAME_PERSPECTIVE).nullable(),
  source: z.enum(GAME_SOURCE),
  externalUrl: z.string().nullable(),
  timeControlInitialSeconds: z.number().int().nullable(),
  timeControlIncrementSeconds: z.number().int().nullable(),
  openingName: z.string().nullable(),
});

/** Mirrors `@velachess/infra-db`'s `Game` row (`getGameForReview`'s base)
 * plus the two provider-identity fields it decorates. `playedAt`/
 * `createdAt` travel as ISO text on the wire, not a `Date` — `apps/web`'s
 * `gameQuery` spreads this response directly into `ReplayableGame` and
 * reads `rawPgn` off it, so this needs real fields, not a loose record
 * (caught by the RPC typecheck gate). */
const seatIdentitySchema = z.object({
  avatarUrl: z.string().nullable(),
  flair: z.string().nullable(),
});
const gameDetailSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  source: z.enum(GAME_SOURCE),
  externalId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  accountId: z.string().uuid().nullable(),
  perspective: z.enum(GAME_PERSPECTIVE).nullable(),
  whiteName: z.string(),
  whiteRating: z.number().int().nullable(),
  blackName: z.string(),
  blackRating: z.number().int().nullable(),
  result: z.enum(GAME_RESULT),
  playedAt: z.string().nullable(),
  timeControlInitialSeconds: z.number().int().nullable(),
  timeControlIncrementSeconds: z.number().int().nullable(),
  timeControlRaw: z.string().nullable(),
  openingEco: z.string().nullable(),
  openingName: z.string().nullable(),
  openingUrl: z.string().nullable(),
  termination: z.string().nullable(),
  hasClocks: z.boolean(),
  rawPgn: z.string(),
  movetextHash: z.string(),
  createdAt: z.string(),
  whiteIdentity: seatIdentitySchema,
  blackIdentity: seatIdentitySchema,
});

/**
 * The serializers. Built from the schemas above with `.extend()`, so only
 * the timestamp columns are restated and the rest cannot drift; the
 * handlers parse through these instead of hand-writing `.toISOString()`
 * next to a schema that only claims the result is a string.
 */
const gameListRowWire = gameListRowSchema.extend({
  playedAt: wireDateOrNull,
});

const gameDetailWire = gameDetailSchema.extend({
  playedAt: wireDateOrNull,
  createdAt: wireDate,
});

const libraryRoute = createRoute({
  method: "get",
  path: "/",
  summary: "The signed-in user's unified game library",
  description:
    "One filtered page of every game the user owns — Chess.com and Lichess archives next to manually imported PGNs, provenance visible per row but never deciding what appears. A read, and nothing but a read: connecting a provider is POST /accounts, importing a file is POST /games/import, and keeping an archive current is POST /accounts/{id}/sync. Engine-free — analysis runs in the browser when a game is opened, never on this list.",
  request: { query: libraryQuery },
  responses: {
    200: {
      description: "One page of the user's games across every source (no PGN payloads)",
      content: {
        "application/json": {
          schema: z.object({
            games: z.array(gameListRowSchema),
            total: z.number().int().describe("Rows matching the filters, not the page"),
            page: z.number().int(),
            pageSize: z.number().int(),
          }),
        },
      },
    },
  },
});

const importOutcomeSchema = z.object({
  imported: z.number().int().describe("Games written for this user"),
  duplicates: z
    .number()
    .int()
    .describe("Games this user already had — skipped as a no-op"),
  rejected: z.number().int().describe("Chunks that failed to parse"),
});

const importPgnRoute = createRoute({
  method: "post",
  path: "/import",
  summary: "Import games from a PGN upload",
  description:
    "The manual source: no connected account, no cursor, no sync lifecycle — and no engine (analysis runs in the browser when a game is opened). Every parseable game lands in the caller's library; `participation` resolves which side is theirs — forced White/Black for the whole batch, or by-name header matching per game, so a by-name file may mix White and Black and games naming them on neither side import unattributed. Re-importing is idempotent per user: duplicates are successful no-ops counted in the response, never errors.",
  request: {
    body: { content: { "application/json": { schema: importPgnSchema } } },
  },
  responses: {
    200: {
      description: "What landed and what didn't, all three counts at once",
      content: { "application/json": { schema: importOutcomeSchema } },
    },
  },
});

const getGameRoute = createRoute({
  method: "get",
  path: "/{id}",
  summary: "The full game, rawPgn included",
  description:
    "Board replay needs the movetext; the list endpoint deliberately omits it. Both seats carry their provider identity (avatarUrl / Lichess flair) resolved from a shared per-handle cache — fetched on the first open per refresh window, initials when unknown, and never a reason for the read to fail.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Game row with rawPgn, players, result, opening and timing metadata",
      content: { "application/json": { schema: gameDetailSchema } },
    },
    404: {
      description: "Unknown game",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

/** Narrow composed deps per handler — routes never see a Database value
 * directly. */
export interface GamesRouteDeps {
  get: GetGameDeps;
  list: ListGamesDeps;
  importPgn: ImportPgnDeps;
}

export function gamesRoutes(deps: GamesRouteDeps) {
  return (
    new OpenAPIHono<ApiEnv>({ defaultHook })
      // The user's unified library — synced accounts and manual PGN
      // imports together, ownership read straight off the row. A pure
      // read: connecting a provider is POST /accounts, importing a file
      // is POST /games/import; neither ever happens on a GET.
      .openapi(libraryRoute, async (c) => {
        const { page, pageSize, ...filters } = c.req.valid("query");
        const library = await openLibrary(deps.list, c.get("userId"), {
          filters,
          page: { page, pageSize },
        });
        return c.json(
          Object.assign({}, library, {
            games: library.games.map((game) => gameListRowWire.parse(game)),
          }),
          200,
        );
      })
      // Manual PGN upload: no account, no cursor, no sync lifecycle —
      // and no engine. The slice persists with conflict-ignore (re-import
      // of the same file is a counted no-op).
      .openapi(importPgnRoute, async (c) => {
        const outcome = await importPgnForUser(
          deps.importPgn,
          c.get("userId"),
          c.req.valid("json"),
        );
        return c.json(outcome, 200);
      })
      .openapi(getGameRoute, async (c) => {
        // The full game, rawPgn included — board replay needs the movetext.
        // Seat identities ride along, resolved from the profile cache; a
        // cold opponent costs one provider read on the first open only.
        // Scoped by owner: a stranger's game id and a missing one are the
        // same 404, so the route never confirms which uuids exist.
        const game = await getGameForReview(
          deps.get,
          c.get("userId"),
          c.req.valid("param").id,
        );
        if (!game) return c.json({ error: "game not found" }, 404);
        return c.json(gameDetailWire.parse(game), 200);
      })
  );
}
