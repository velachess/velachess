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

const MAX_PAGE_SIZE = 100;

/** Mirrors `@velachess/infra-platforms`' `resultSchema`,
 * `perspectiveSchema`, `gameSourceSchema` and `TIME_CLASSES`, which
 * `routes-no-direct-infra` forbids importing; guarded by
 * `apps/server/tests/contracts.test.ts`. */
export const GAME_RESULT = ["1-0", "0-1", "1/2-1/2", "*"] as const;
export const GAME_PERSPECTIVE = ["white", "black"] as const;
export const GAME_SOURCE = ["chess_com", "lichess", "pgn"] as const;
export const GAME_TIME_CLASS = ["bullet", "blitz", "rapid", "classical"] as const;

const MAX_OPPONENT_LENGTH = 64;

const timeClassValue = z.enum(GAME_TIME_CLASS);

const libraryQuery = z.object({
  opponent: z
    .string()
    .trim()
    .min(1)
    .max(MAX_OPPONENT_LENGTH)
    .optional()
    .describe("Substring of the opponent's handle, case-insensitive"),
  color: z
    .enum(["white", "black"])
    .optional()
    .describe("Which side you played, resolved per game"),
  outcome: z
    .enum(["win", "loss", "draw"])
    .optional()
    .describe("From the player's side, not the scoresheet's"),
  // Repeatable: a single `?timeClass=blitz` reaches the validator as a bare
  // string, not a one-element array.
  timeClass: z
    .union([timeClassValue, z.array(timeClassValue)])
    .optional()
    .describe(
      "Any of the classes, bucketed by estimated duration (initial + 40 × increment)",
    ),
  source: z.enum(GAME_SOURCE).optional().describe("Where the game came from"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
});

/** Optional: without it, games still land, just unattributed. */
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

/** One seat's provider identity, which both reads carry. */
const seatIdentitySchema = z.object({
  avatarUrl: z.string().nullable(),
  flair: z.string().nullable(),
  countryCode: z.string().nullable(),
});

/**
 * Mirrors `listGamesPage`'s projection, which is inferred from a Drizzle
 * query rather than declared, plus the seat identities `openLibrary`
 * attaches from the profile cache. `apps/web`'s games list reads these
 * fields directly, so a loose record is not an option, and `playedAt`
 * travels as ISO text.
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
  whiteIdentity: seatIdentitySchema,
  blackIdentity: seatIdentitySchema,
});

/** `apps/web`'s `gameQuery` spreads this response straight into
 * `ReplayableGame` and reads `rawPgn` off it, so it needs real fields, not
 * a loose record; the timestamps travel as ISO text. */
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

/** Only the timestamp columns are restated, so the rest cannot drift. */
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
    "One filtered page of every game the user owns — Chess.com and Lichess archives next to manually imported PGNs, provenance visible per row but never deciding what appears. Both seats carry whatever the shared per-handle profile cache already holds (avatar, Lichess flair, country) — read in one batch for the page and never fetched here, so listing spends no provider request. A read, and nothing but a read: connecting a provider is POST /accounts, importing a file is POST /games/import, and keeping an archive current is POST /accounts/{id}/sync. Engine-free — analysis runs in the browser when a game is opened, never on this list.",
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

export interface GamesRouteDeps {
  get: GetGameDeps;
  list: ListGamesDeps;
  importPgn: ImportPgnDeps;
}

export function gamesRoutes(deps: GamesRouteDeps) {
  return (
    new OpenAPIHono<ApiEnv>({ defaultHook })
      // A pure read: connecting a provider is POST /accounts and importing
      // a file is POST /games/import, never a GET.
      .openapi(libraryRoute, async (c) => {
        const { page, pageSize, timeClass, ...filters } = c.req.valid("query");
        const library = await openLibrary(deps.list, c.get("userId"), {
          filters: {
            ...filters,
            ...(timeClass === undefined ? {} : { timeClasses: [timeClass].flat() }),
          },
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
