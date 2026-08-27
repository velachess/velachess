import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { drillSummaryFor } from "@velachess/application/analysis/get-analysis/drill-summary";
import { getAnalysisReport } from "@velachess/application/analysis/get-analysis/get-analysis";
import { requestAnalysis } from "@velachess/application/analysis/request-analysis/request-analysis";
import { importPgnForUser } from "@velachess/application/games/import-pgn/import-pgn";
import { judgeGamesForUser } from "@velachess/application/games/judge-games/judge-games";
import { getGameForReview } from "@velachess/application/games/get-game/get-game";
import { openLibrary } from "@velachess/application/games/list-games/list-games";
import { getGameForUser } from "@velachess/db";

import type { ApiEnv } from "../server.ts";
import type { ApiDeps } from "../deps.ts";
import { validateIdParam, validateJson, validateQuery } from "../validation.ts";

/** The largest page worth answering in one round trip. */
const MAX_PAGE_SIZE = 100;

const libraryQuery = z.object({
  color: z.enum(["white", "black"]).optional(),
  outcome: z.enum(["win", "loss", "draw"]).optional(),
  verdict: z.enum(["deviation", "gap", "book-ended", "completed", "unjudged"]).optional(),
  timeClass: z.enum(["bullet", "blitz", "rapid", "classical"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
});

/**
 * The name is what the PGN headers call them — the one identity a
 * hand-written file can carry. Optional at the API: without it games
 * still land, just unattributed and unjudgeable.
 */
const importPgnSchema = z.object({
  pgn: z.string().min(1),
  playerName: z.string().min(1).max(128).optional(),
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

export function gamesRoutes(deps: ApiDeps) {
  return (
    new Hono<ApiEnv>()
      // The user's unified library — synced accounts and manual PGN
      // imports together, ownership read straight off the row. A pure
      // read: connecting a provider is POST /accounts, importing a file
      // is POST /games/import; neither ever happens on a GET.
      .get("/", validateQuery(libraryQuery), async (c) => {
        const { page, pageSize, ...filters } = c.req.valid("query");
        const library = await openLibrary(deps.db, c.get("userId"), {
          filters,
          page: { page, pageSize },
        });
        return c.json(library);
      })
      // Manual PGN upload: no account, no cursor, no sync lifecycle —
      // and no engine. The slice persists with conflict-ignore (re-import
      // of the same file is a counted no-op) and runs the same
      // extract → judge → seed tail a sync runs.
      .post("/import", validateJson(importPgnSchema), async (c) => {
        const outcome = await importPgnForUser(
          deps.db,
          c.get("userId"),
          deps.analysisQueue,
          c.req.valid("json"),
        );
        return c.json(outcome);
      })
      .post("/judge", async (c) => {
        const outcome = await judgeGamesForUser(
          deps.db,
          c.get("userId"),
          deps.analysisQueue,
        );
        return c.json(outcome);
      })
      .get("/:id", validateIdParam, async (c) => {
        // The full game, rawPgn included — board replay needs the movetext.
        // Seat identities ride along, resolved from the profile cache; a
        // cold opponent costs one provider read on the first open only.
        // Scoped by owner: a stranger's game id and a missing one are the
        // same 404, so the route never confirms which uuids exist.
        const game = await getGameForReview(
          deps.db,
          c.get("userId"),
          c.req.valid("param").id,
          deps.sync,
        );
        if (!game) return c.json({ error: "game not found" }, 404);
        return c.json(game);
      })
      .get("/:id/analysis", validateIdParam, async (c) => {
        const gameId = c.req.valid("param").id;
        // Ownership first: an analysis narrates the game, so reading it is
        // reading the game. The shaping — report + drill count together,
        // progress absent-not-zero — is the get-analysis slice's; this
        // route only maps its answer onto HTTP.
        if (!(await getGameForUser(deps.db, c.get("userId"), gameId)))
          return c.json({ error: "game not found" }, 404);
        const report = await getAnalysisReport(deps.db, deps.analysisQueue, gameId);
        if (report.status === "not-found")
          return c.json({ error: "game not found" }, 404);
        return c.json(report);
      })
      /**
       * Enqueues only — the worker runs it, `GET /analysis/events` watches. Keeps
       * delivery/retry/concurrency in pg-boss instead of tying analysis to this request's lifetime.
       * Idempotent via the queue's singleton key.
       */
      .post("/:id/analyze", validateIdParam, async (c) => {
        const gameId = c.req.valid("param").id;
        // The only engine trigger in the system: your games spend the CPU,
        // and the drills a run seeds land in your queue — nobody else's.
        if (!(await getGameForUser(deps.db, c.get("userId"), gameId)))
          return c.json({ error: "game not found" }, 404);

        const request = await requestAnalysis(deps.db, deps.analysisQueue, gameId);
        if (request.status === "not-found")
          return c.json({ error: "game not found" }, 404);
        if (request.status === "completed") {
          // The CTA's count rides with the report it belongs to: a second
          // round trip would let the two disagree on screen.
          const drills = await drillSummaryFor(deps.db, gameId);
          return c.json({ status: "completed", analysis: request.analysis, drills });
        }
        if (request.status === "failed") return c.json({ status: "failed" }, 409);
        if (request.status === "queued" || request.status === "running") {
          return c.json({ status: request.status }, 202);
        }

        await deps.analysisQueue.enqueue(deps.db, gameId);
        return c.json({ status: "queued" }, 202);
      })

      /**
       * Plain SSE (a `GET`, so `EventSource` needs no polyfill). Reads the worker's
       * progress rows and the report that supersedes them; owns no computation.
       * Always closes on `done`/`error` — a left-hanging EventSource reconnects forever.
       */
      .get("/:id/analysis/events", validateIdParam, async (c) => {
        const gameId = c.req.valid("param").id;
        // The stream shows every graded move of the game — owner only.
        if (!(await getGameForUser(deps.db, c.get("userId"), gameId)))
          return c.json({ error: "game not found" }, 404);
        const opening = await requestAnalysis(deps.db, deps.analysisQueue, gameId);
        if (opening.status === "not-found")
          return c.json({ error: "game not found" }, 404);

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
          for await (const snapshot of deps.watchers.watch(gameId, c.req.raw.signal)) {
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
            if (terminal?.status === "completed") {
              await stream.writeSSE({
                event: STREAM_EVENTS.completed,
                data: JSON.stringify({ positions: terminal.analysis.positions }),
              });
              return;
            }
            if (terminal?.status === "failed") {
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
