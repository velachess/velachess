import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";

import {
  drillSummaryFor,
  getAnalysisReport,
  requestAnalysisForUser,
  startAnalysisForUser,
  type DrillSummaryDeps,
  type GetAnalysisDeps,
  type RequestAnalysisDeps,
  type Watchers,
} from "@velachess/analysis";
import {
  getGameForReview,
  importPgnForUser,
  judgeGamesForUser,
  openLibrary,
  type GetGameDeps,
  type ImportPgnDeps,
  type JudgeGamesDeps,
  type ListGamesDeps,
} from "@velachess/games";

import type { ApiEnv } from "../server.ts";
import { ANALYSIS_STATUS } from "../status.ts";
import { defaultHook, errorResponseSchema, idParamSchema } from "../validation.ts";

/** Repeated across the four analysis endpoints below — one place to change the wording. */
const GAME_NOT_FOUND_ERROR = "game not found";

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
  verdict: z
    .enum(["deviation", "gap", "book-ended", "completed", "unjudged"])
    .optional()
    .describe("The repertoire's verdict; `unjudged` means no book saw the game"),
  timeClass: z
    .enum(["bullet", "blitz", "rapid", "classical"])
    .optional()
    .describe("Bucketed by estimated duration (initial + 40 × increment)"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
});

/**
 * The name is what the PGN headers call them — the one identity a
 * hand-written file can carry. Optional at the API: without it games
 * still land, just unattributed and unjudgeable.
 */
const importPgnSchema = z.object({
  pgn: z.string().min(1).describe("One or more games in PGN format"),
  playerName: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe("The player these games belong to, as named in the headers"),
});

/**
 * Mirrors the `.select({...})` projection in
 * `libs/infra/db/queries/status.ts`'s `listGamesPage` — inferred from a
 * Drizzle query, never a declared interface, so this is the one place
 * that shape is written out by hand. `apps/web`'s games-list table reads
 * these fields directly (caught by the RPC typecheck gate, same lesson
 * as `/insights` and `/games/{id}`), so a loose record isn't an option
 * here either. `playedAt` travels as ISO text on the wire, not a `Date`.
 */
const gameListRowSchema = z.object({
  id: z.string().uuid(),
  whiteName: z.string(),
  whiteRating: z.number().int().nullable(),
  blackName: z.string(),
  blackRating: z.number().int().nullable(),
  result: z.enum(["1-0", "0-1", "1/2-1/2", "*"]),
  playedAt: z.string().nullable(),
  perspective: z.enum(["white", "black"]).nullable(),
  source: z.enum(["chess_com", "lichess", "pgn"]),
  externalUrl: z.string().nullable(),
  timeControlInitialSeconds: z.number().int().nullable(),
  timeControlIncrementSeconds: z.number().int().nullable(),
  openingName: z.string().nullable(),
  repertoireName: z.string().nullable(),
  judgmentType: z.string().nullable(),
  judgmentPly: z.number().int().nullable(),
  analyzed: z.boolean(),
});

/** Mirrors `@velachess/infra-db`'s `Game` row (`getGameForReview`'s base)
 * plus the two provider-identity fields it decorates. `playedAt`/
 * `createdAt` travel as ISO text on the wire, not a `Date` — `apps/web`'s
 * `gameQuery` spreads this response directly into `ReplayableGame` and
 * reads `rawPgn` off it, so this needs real fields, not a loose record
 * (caught by the RPC typecheck gate, same lesson as `/insights`). */
const seatIdentitySchema = z.object({
  avatarUrl: z.string().nullable(),
  flair: z.string().nullable(),
});
const gameDetailSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  source: z.enum(["chess_com", "lichess", "pgn"]),
  externalId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  accountId: z.string().uuid().nullable(),
  perspective: z.enum(["white", "black"]).nullable(),
  whiteName: z.string(),
  whiteRating: z.number().int().nullable(),
  blackName: z.string(),
  blackRating: z.number().int().nullable(),
  result: z.enum(["1-0", "0-1", "1/2-1/2", "*"]),
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

const libraryRoute = createRoute({
  method: "get",
  path: "/",
  summary: "The signed-in user's unified game library",
  description:
    "One filtered page of every game the user owns — Chess.com and Lichess archives next to manually imported PGNs, provenance visible per row but never deciding what appears. A read, and nothing but a read: connecting a provider is POST /accounts, importing a file is POST /games/import, and keeping an archive current is POST /accounts/{id}/sync. Engine-free — analysis is triggered by opening a game, never by listing.",
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
  judged: z.number().int(),
  seeded: z.number().int(),
});

const importPgnRoute = createRoute({
  method: "post",
  path: "/import",
  summary: "Import games from a PGN upload",
  description:
    "The manual source: no connected account, no cursor, no sync lifecycle — and no engine (analysis is triggered by opening a game). Every parseable game lands in the caller's library; `playerName` resolves which side is theirs per game, so one file may mix White and Black, and games naming them on neither side import unattributed. Re-importing is idempotent per user: duplicates are successful no-ops counted in the response, never errors. New games feed the same repertoire → judgment → seeding pass a sync runs.",
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

const judgeOutcomeSchema = z.object({
  judged: z.number().int(),
  skipped: z.number().int(),
  enqueuedForAnalysis: z.number().int(),
});

const judgeGamesRoute = createRoute({
  method: "post",
  path: "/judge",
  summary: "Judge all unjudged games against the user's repertoires",
  description:
    "Replay only — no engine. Deviations wait for a severity until the game is opened and analyzed.",
  responses: {
    200: {
      description: "Judgment outcome",
      content: { "application/json": { schema: judgeOutcomeSchema } },
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

/** Mirrors `@velachess/infra-db`'s `StoredGradedPly`. */
const evalScoreSchema = z.object({
  cp: z.number().int().optional(),
  mate: z.number().int().optional(),
});
const gradedPlySchema = z.object({
  ply: z.number().int(),
  fen: z.string(),
  san: z.string(),
  evalBefore: evalScoreSchema,
  evalAfter: evalScoreSchema,
  bestMove: z.string(),
  category: z.enum(["best", "good", "inaccuracy", "mistake", "blunder"]),
  winChanceLoss: z.number(),
});

/** Mirrors `@velachess/analysis`'s `GameAnalysisRecord` (`GameAnalysisRow`)
 * — `createdAt` travels as ISO text on the wire, not a `Date`. */
const gameAnalysisRecordSchema = z
  .object({
    id: z.string().uuid(),
    gameId: z.string().uuid(),
    engineVersion: z.string(),
    depth: z.number().int(),
    positions: z.array(gradedPlySchema),
    createdAt: z.string(),
  })
  .describe("Persisted engine report for a game");

/** Mirrors `@velachess/analysis`'s `DrillSummary`. */
const drillSummarySchema = z
  .object({
    eligible: z
      .number()
      .int()
      .describe("Plies on the user's side this game would drill, seeded or not."),
    seeded: z.number().int().describe("Of those, the ones that already are an exercise."),
    triaged: z
      .boolean()
      .describe(
        "False while triage still owes this game exercises. The screen waits instead of announcing zero, which reads as 'nothing to drill'.",
      ),
  })
  .describe("What the report's drill CTA counts. Present with `analysis`.");

function toWireAnalysis<T extends { createdAt: Date }>(analysis: T) {
  return Object.assign({}, analysis, { createdAt: analysis.createdAt.toISOString() });
}

const analysisProgressBase = z.object({
  graded: z
    .number()
    .int()
    .optional()
    .describe(
      "Positions a run in flight has graded. Absent — never zero — until a run reports; 'not started' and 'graded none' are different answers.",
    ),
  total: z
    .number()
    .int()
    .optional()
    .describe("Positions that run will grade. Present with `graded`."),
});

/** `AnalysisReport` minus its `not-found` branch — the route answers that
 * one as a 404 before this schema ever applies. One literal-discriminated
 * branch per real status value (rather than one branch with a multi-value
 * enum) — `z.discriminatedUnion` needs an exact literal per branch, and
 * this shape also plays best with the handler's own return-type
 * inference across two `c.json(...)` calls for the same 200 status. */
const analysisReportSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal(ANALYSIS_STATUS.COMPLETED),
    analysis: gameAnalysisRecordSchema,
    drills: drillSummarySchema,
  }),
  analysisProgressBase.extend({ status: z.literal(ANALYSIS_STATUS.CREATED) }),
  analysisProgressBase.extend({ status: z.literal(ANALYSIS_STATUS.QUEUED) }),
  analysisProgressBase.extend({ status: z.literal(ANALYSIS_STATUS.RUNNING) }),
  analysisProgressBase.extend({ status: z.literal(ANALYSIS_STATUS.FAILED) }),
]);

const getAnalysisRoute = createRoute({
  method: "get",
  path: "/{id}/analysis",
  summary: "Read-only analysis state for a game, with a run's progress",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Current state; includes the report when completed",
      content: { "application/json": { schema: analysisReportSchema } },
    },
    404: {
      description: "Unknown game",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

const analyzeCompletedSchema = z.object({
  status: z.literal(ANALYSIS_STATUS.COMPLETED),
  analysis: gameAnalysisRecordSchema,
  drills: drillSummarySchema,
});
const analyzeAcceptedSchema = z.object({
  status: z.enum([
    ANALYSIS_STATUS.CREATED,
    ANALYSIS_STATUS.QUEUED,
    ANALYSIS_STATUS.RUNNING,
  ]),
});
const analyzeFailedSchema = z.object({ status: z.literal(ANALYSIS_STATUS.FAILED) });

const analyzeGameRoute = createRoute({
  method: "post",
  path: "/{id}/analyze",
  summary: "Ask for a game to be analyzed",
  description:
    "The trigger, and only the trigger: it enqueues and returns, never holding the run open. State mapping: completed → 200 with the cached report; failed (retries exhausted) → 409; otherwise 202 and the worker takes it. Idempotent — asking twice for a queued game is the same 202, not a second run. Watch it at GET /games/{id}/analysis/events.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Already analyzed — the cached report, no run started",
      content: { "application/json": { schema: analyzeCompletedSchema } },
    },
    202: {
      description: "Accepted: queued now, or already queued or running",
      content: { "application/json": { schema: analyzeAcceptedSchema } },
    },
    404: {
      description: "Unknown game",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Delivery retries exhausted; the job is dead-lettered",
      content: { "application/json": { schema: analyzeFailedSchema } },
    },
  },
});

const watchAnalysisRoute = createRoute({
  method: "get",
  path: "/{id}/analysis/events",
  summary: "Watch a run's progress over Server-Sent Events",
  description:
    "A plain GET, so `EventSource` opens it directly. Observes durable state and owns no computation.\n\nEvents: `analysis.move-graded` per ply with the frame `id` set to `<runId>:<index>`, then a terminal `analysis.completed` carrying the whole report, or `analysis.failed`. No event is named `error`: that name collides with the one EventSource itself fires on transport failure.\n\nHonours `Last-Event-ID`, so a reconnection resumes from the frame after the one named rather than replaying the run. Sends `: keep-alive` comments so proxies do not close an idle stream, and `X-Accel-Buffering: no` so nginx does not buffer it. Ends without a terminal event on the connection deadline — not terminal for the run, and the browser reconnects.",
  request: { params: idParamSchema },
  responses: {
    // Not a Zod/JSON response — SSE is a plain literal schema, the one
    // place this route file describes a shape without a Zod source.
    200: {
      description:
        "Event stream, terminated by a terminal frame or the connection deadline",
      content: { "text/event-stream": { schema: { type: "string" } } },
    },
    404: {
      description: "Unknown game",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

/** Namespaced, past-tense event names — plain `error` would collide with EventSource's own transport-failure event. */
const STREAM_EVENTS = {
  moveGraded: "analysis.move-graded",
  completed: "analysis.completed",
  failed: "analysis.failed",
} as const;

/** How long a quiet stream may stay quiet before a proxy assumes it died. */
const HEARTBEAT_MS = 15_000;

/**
 * A frame id, which is a stream cursor and not a domain number.
 * `<runId>:<index>` — the run is what makes it safe to resume from.
 */
function parseCursor(header: string | undefined) {
  const [runId, index] = (header ?? "").split(":");
  const at = Number(index);
  if (!runId || !Number.isInteger(at) || at < 0) return null;
  return { runId, index: at };
}

/** Caps how long a watch connection polls a run that never reaches a terminal state (e.g. a hard-killed worker). Safe to end: EventSource reconnects and replays from durable rows. */
const WATCH_DEADLINE_MS = 120_000;

/**
 * Jittered, because the deadline is shared. Every watcher of a long run
 * would otherwise expire in the same instant and reconnect together — a
 * thundering herd of our own making, worst exactly when a run is slow
 * enough for many people to still be watching.
 */
function watchDeadline() {
  return WATCH_DEADLINE_MS * (0.9 + Math.random() * 0.2);
}

/** Narrow composed deps per handler — routes never see a Database,
 * AnalysisQueue, or Watchers-building object directly. `analysis` bundles
 * the four narrow contracts the analysis endpoints below declared,
 * assembled at `apps/server/src/composition/analysis.ts`. */
export interface GamesRouteDeps {
  get: GetGameDeps;
  list: ListGamesDeps;
  importPgn: ImportPgnDeps;
  judge: JudgeGamesDeps;
  analysis: {
    getAnalysis: GetAnalysisDeps;
    requestAnalysis: RequestAnalysisDeps;
    drillSummary: DrillSummaryDeps;
    watchers: Watchers;
  };
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
            games: library.games.map((game) =>
              Object.assign({}, game, {
                playedAt: game.playedAt?.toISOString() ?? null,
                // Drizzle's `isNotNull(...)` projection types as an opaque
                // SQL expression, not `boolean` — coerce at the boundary.
                analyzed: Boolean(game.analyzed),
              }),
            ),
          }),
          200,
        );
      })
      // Manual PGN upload: no account, no cursor, no sync lifecycle —
      // and no engine. The slice persists with conflict-ignore (re-import
      // of the same file is a counted no-op) and runs the same
      // land-new-games tail a sync runs.
      .openapi(importPgnRoute, async (c) => {
        const outcome = await importPgnForUser(
          deps.importPgn,
          c.get("userId"),
          c.req.valid("json"),
        );
        return c.json(outcome, 200);
      })
      .openapi(judgeGamesRoute, async (c) => {
        const outcome = await judgeGamesForUser(deps.judge, c.get("userId"));
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
        return c.json(
          Object.assign({}, game, {
            playedAt: game.playedAt?.toISOString() ?? null,
            createdAt: game.createdAt.toISOString(),
          }),
          200,
        );
      })
      .openapi(getAnalysisRoute, async (c) => {
        const gameId = c.req.valid("param").id;
        // Ownership, and the shaping — report + drill count together,
        // progress absent-not-zero — all live in the get-analysis slice;
        // this route only maps its answer onto HTTP.
        const report = await getAnalysisReport(
          deps.analysis.getAnalysis,
          c.get("userId"),
          gameId,
        );
        if (report.status === ANALYSIS_STATUS.NOT_FOUND)
          return c.json({ error: GAME_NOT_FOUND_ERROR }, 404);
        if (report.status === ANALYSIS_STATUS.COMPLETED) {
          return c.json(
            {
              status: ANALYSIS_STATUS.COMPLETED,
              analysis: toWireAnalysis(report.analysis),
              drills: report.drills,
            },
            200,
          );
        }
        return c.json(
          { status: report.status, graded: report.graded, total: report.total },
          200,
        );
      })
      /**
       * Enqueues only — the worker runs it, `GET /analysis/events` watches. Keeps
       * delivery/retry/concurrency in pg-boss instead of tying analysis to this request's lifetime.
       * Idempotent via the queue's singleton key.
       */
      .openapi(analyzeGameRoute, async (c) => {
        const gameId = c.req.valid("param").id;
        // Ownership, and the decision to start the engine when nothing is
        // running yet, both live in the request-analysis slice — the only
        // engine trigger in the system: your games spend the CPU, and the
        // drills a run seeds land in your queue — nobody else's.
        const request = await startAnalysisForUser(
          deps.analysis.requestAnalysis,
          c.get("userId"),
          gameId,
        );
        if (request.status === ANALYSIS_STATUS.NOT_FOUND)
          return c.json({ error: GAME_NOT_FOUND_ERROR }, 404);
        if (request.status === ANALYSIS_STATUS.COMPLETED) {
          // The CTA's count rides with the report it belongs to: a second
          // round trip would let the two disagree on screen.
          const drills = await drillSummaryFor(deps.analysis.drillSummary, gameId);
          return c.json(
            {
              status: ANALYSIS_STATUS.COMPLETED,
              analysis: toWireAnalysis(request.analysis),
              drills,
            },
            200,
          );
        }
        if (request.status === ANALYSIS_STATUS.FAILED)
          return c.json({ status: ANALYSIS_STATUS.FAILED }, 409);
        return c.json({ status: request.status }, 202);
      })

      /**
       * Plain SSE (a `GET`, so `EventSource` needs no polyfill). Reads the worker's
       * progress rows and the report that supersedes them; owns no computation.
       * Always closes on `done`/`error` — a left-hanging EventSource reconnects forever.
       */
      .openapi(watchAnalysisRoute, async (c) => {
        const gameId = c.req.valid("param").id;
        // The stream shows every graded move of the game — owner only.
        const opening = await requestAnalysisForUser(
          deps.analysis.requestAnalysis,
          c.get("userId"),
          gameId,
        );
        if (opening.status === ANALYSIS_STATUS.NOT_FOUND)
          return c.json({ error: GAME_NOT_FOUND_ERROR }, 404);

        // nginx and most reverse proxies buffer a proxied response until
        // their buffer fills, which on a stream is indistinguishable from
        // a hung analysis. Hono sets the other three SSE headers already.
        c.header("X-Accel-Buffering", "no");

        // Last-Event-ID resumes from the tail. Must include the run id, not just the
        // index: pg-boss retries renumber positions from zero, so a bare index could
        // resume past moves the replacement run hasn't graded yet.
        const resumed = parseCursor(c.req.header("Last-Event-ID"));

        return streamSSE(c, async (stream) => {
          let sent = 0;
          let cursorRun = resumed?.runId;
          let lastSpokeAt = Date.now();
          const expiresAt = Date.now() + watchDeadline();

          // The loop belongs to the game, not to this connection: see
          // src/watchers.ts. This reads what it publishes.
          for await (const snapshot of deps.analysis.watchers.watch(
            gameId,
            c.req.raw.signal,
          )) {
            if (stream.aborted || Date.now() >= expiresAt) return;

            const runId = snapshot.rows[0]?.runId;
            if (resumed && cursorRun !== undefined && runId !== undefined) {
              if (cursorRun === runId) sent = resumed.index + 1;
              cursorRun = undefined;
            }

            for (const row of snapshot.rows.filter((entry) => entry.index >= sent)) {
              // oxlint-disable-next-line eslint/no-await-in-loop
              await stream.writeSSE({
                event: STREAM_EVENTS.moveGraded,
                // A stream cursor, scoped to the run that produced it.
                // Deliberately not the same concept as the payload's
                // `index`, which is this run's own numbering.
                id: `${row.runId}:${row.index}`,
                data: JSON.stringify({
                  index: row.index,
                  total: row.total,
                  position: row.position,
                }),
              });
              sent = row.index + 1;
              lastSpokeAt = Date.now();
            }

            const terminal = snapshot.terminal;
            if (terminal?.status === ANALYSIS_STATUS.COMPLETED) {
              await stream.writeSSE({
                event: STREAM_EVENTS.completed,
                data: JSON.stringify({ positions: terminal.analysis.positions }),
              });
              return;
            }
            if (terminal?.status === ANALYSIS_STATUS.FAILED) {
              await stream.writeSSE({
                event: STREAM_EVENTS.failed,
                data: JSON.stringify({ message: "analysis failed" }),
              });
              return;
            }

            // A comment line: the client ignores it, every proxy between
            // here and there counts it as traffic. Without it a stream
            // that goes quiet longer than an idle timeout — one hard
            // position is enough — is closed by an intermediary.
            if (Date.now() - lastSpokeAt >= HEARTBEAT_MS) {
              await stream.write(": keep-alive\n\n");
              lastSpokeAt = Date.now();
            }
          }

          // Leaving the loop is the deadline, the client, or the run
          // ending. None of the first two is terminal for the run, so
          // none gets a terminal frame: the browser reconnects and
          // resumes from its last id.
        });
      })
  );
}
