import { http, HttpResponse } from "msw";

import type { GradedPly } from "../../games/analysis-contract.ts";
import {
  analysisAnswerFor,
  archiveAccount,
  gameById,
  countWatch,
  knowsPlayer,
  readArchive,
  seatIdentityFields,
} from "../archive.ts";
import { GAME_PGN } from "../games.ts";

/** The API's own default, so an unpaged read answers the same size it does. */
const DEFAULT_PAGE_SIZE = 25;

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

/** Importing and listing are the same read; 400/404 match the route, so the UI fails on its own terms rather than the test peeking at the request. */
export const gamesHandlers = [
  http.get("/api/games", ({ request }) => {
    const query = new URL(request.url).searchParams;
    const platform = query.get("platform");
    const username = query.get("username");

    if (!platform || !username) {
      return HttpResponse.json({ error: "invalid query" }, { status: 400 });
    }

    if (!knowsPlayer(platform, username)) {
      return HttpResponse.json({ error: "archive not found" }, { status: 404 });
    }

    const page = readArchive({
      color: query.get("color"),
      outcome: query.get("outcome"),
      timeClass: query.get("timeClass"),
      page: positiveInt(query.get("page"), 1),
      pageSize: positiveInt(query.get("pageSize"), DEFAULT_PAGE_SIZE),
    });

    return HttpResponse.json({ account: archiveAccount(), ...page });
  }),

  http.get("/api/games/:id", ({ params }) => {
    const game = gameById(String(params["id"]));
    if (!game) return HttpResponse.json({ error: "game not found" }, { status: 404 });
    // Fields the list does not carry: movetext, this screen's tags, and
    // both seats' provider identity as the profile cache resolved it.
    return HttpResponse.json({
      ...game,
      ...seatIdentityFields(String(params["id"])),
      openingEco: "C20",
      termination: "by resignation",
      rawPgn: GAME_PGN,
    });
  }),

  // Read-only: answers without "running the engine", like the route.
  http.get("/api/games/:id/analysis", ({ params }) => {
    const staged = analysisAnswerFor(String(params["id"]));
    if (!staged) return HttpResponse.json({ status: "created" });

    switch (staged.kind) {
      case "cached":
        return HttpResponse.json({ status: "completed", analysis: report(staged.moves) });
      case "failed":
        return HttpResponse.json({ status: "failed" });
      case "elsewhere": {
        // The poll after a 202, converging on the first read so no test
        // waits out an interval.
        staged.reads += 1;
        return HttpResponse.json({ status: "completed", analysis: report(staged.moves) });
      }
      case "stream":
        return HttpResponse.json({ status: "queued" });
    }
  }),

  /**
   * The trigger. It enqueues and returns — an already analyzed game gets
   * its report, a dead one a 409, and everything else a 202 to watch.
   */
  http.post("/api/games/:id/analyze", ({ params }) => {
    if (!gameById(String(params["id"]))) {
      return HttpResponse.json({ error: "game not found" }, { status: 404 });
    }

    const staged = analysisAnswerFor(String(params["id"]));
    if (staged?.kind === "cached") {
      return HttpResponse.json({ status: "completed", analysis: report(staged.moves) });
    }
    if (staged?.kind === "failed") {
      return HttpResponse.json({ status: "failed" }, { status: 409 });
    }
    return HttpResponse.json({ status: "queued" }, { status: 202 });
  }),

  /**
   * The watch route. Terminal on every path — a stream that ends without
   * `done` or `error` is what makes an EventSource reconnect forever.
   */
  http.get("/api/games/:id/analysis/events", ({ params, request }) => {
    const gameId = String(params["id"]);
    const watchesSoFar = countWatch();
    if (!gameById(gameId)) {
      return HttpResponse.json({ error: "game not found" }, { status: 404 });
    }

    const staged = analysisAnswerFor(gameId);
    if (staged?.kind === "failed") {
      return new HttpResponse(
        `event: analysis.failed\ndata: ${JSON.stringify({
          message: "analysis failed",
        })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }

    // The browser sends this on its own reconnection, and the route
    // resumes from it rather than replaying the run.
    const lastSeen = Number(request.headers.get("Last-Event-ID") ?? -1);

    const drops = staged?.kind === "stream" ? staged.dropsAfter : undefined;
    const first = drops !== undefined && watchesSoFar === 1;

    return new HttpResponse(
      sseBody(staged?.moves ?? [], {
        chunkBytes: staged?.kind === "stream" ? staged.chunkBytes : undefined,
        upTo: first ? drops : undefined,
        from: Number.isFinite(lastSeen) ? lastSeen + 1 : 0,
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }),
];

function report(moves: GradedPly[]) {
  return { engineVersion: "stockfish-17", depth: 12, positions: moves };
}

/** `position` frames then `done`, 0-based to match `analyzeGame` — numbering from 1 here once masked an off-by-one against the real server. */
function sseBody(
  moves: GradedPly[],
  {
    chunkBytes,
    upTo,
    from = 0,
  }: {
    chunkBytes?: number | undefined;
    upTo?: number | undefined;
    from?: number | undefined;
  } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const frames = moves
    .map((position, index) => ({ position, index }))
    .filter((entry) => entry.index >= from)
    .map(
      ({ position, index }) =>
        `event: analysis.move-graded\nid: ${index}\ndata: ${JSON.stringify({
          index,
          total: moves.length,
          position,
        })}\n\n`,
    );
  const sent = upTo === undefined ? frames : frames.slice(0, upTo);
  if (upTo === undefined) {
    sent.push(
      `event: analysis.completed\ndata: ${JSON.stringify({ positions: moves })}\n\n`,
    );
  }

  const body = encoder.encode(sent.join(""));
  const size = chunkBytes ?? Math.max(body.byteLength, 1);

  return new ReadableStream({
    start(controller) {
      // One frame per chunk by default; `chunkBytes` cuts the body at
      // byte boundaries instead, which is the shape a real socket gives.
      if (chunkBytes === undefined) {
        for (const frame of sent) controller.enqueue(encoder.encode(frame));
      } else {
        for (let at = 0; at < body.byteLength; at += size) {
          controller.enqueue(body.slice(at, at + size));
        }
      }
      controller.close();
    },
  });
}
