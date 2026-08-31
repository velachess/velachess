import {
  // Experimental (5.101): isolated here so a removal falls back to a plain polling query.
  experimental_streamedQuery as streamedQuery,
  queryOptions,
} from "../libs/react-query.ts";
import { z } from "../libs/zod.ts";

import { parsePgn, replayMainline } from "@velachess/chess";

import { api, apiBaseUrl, parseResponse, type InferResponseType } from "../api/index.ts";
import { eventsOf } from "./watch-analysis/event-source.ts";

const scoreSchema = z.object({
  cp: z.number().optional(),
  mate: z.number().optional(),
});

/** Mirrors the API's GradedPly. */
const gradedPlySchema = z.object({
  /** 1-indexed: the ply this move is. */
  ply: z.number(),
  /** Position before the move was played. */
  fen: z.string(),
  san: z.string(),
  evalBefore: scoreSchema,
  evalAfter: scoreSchema,
  /** The engine's preference at `fen`, in UCI. */
  bestMove: z.string(),
  category: z.enum(["best", "good", "inaccuracy", "mistake", "blunder"]),
  winChanceLoss: z.number(),
});

export type GradedPly = z.infer<typeof gradedPlySchema>;
export type MoveCategory = GradedPly["category"];

/** Severity order, best first — read off the schema so it can't drift from the API's list. */
export const MOVE_CATEGORIES = gradedPlySchema.shape.category.options;

type AnalysisState = InferResponseType<
  (typeof api.games)[":id"]["analysis"]["$get"],
  200
>;
type CompletedAnalysis = Extract<AnalysisState, { status: "completed" }>;
export type DrillCount = NonNullable<CompletedAnalysis["drills"]>;

type GameResponse = InferResponseType<(typeof api.games)[":id"]["$get"], 200>;
type AnalyzeCompleted = InferResponseType<
  (typeof api.games)[":id"]["analyze"]["$post"],
  200
>;

export interface ReplayMove {
  /** 1-indexed — the ply this move is. Ply 0 is the starting position. */
  ply: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
}

export type ReplayableGame = GameResponse & {
  moves: ReplayMove[];
  /** Not always the standard array — a game can start from a position. */
  startFen: string;
};

const STANDARD_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Parsing sits in the fetch, not the render: React Query caches the
 * result, so stepping never re-parses and the screen needs no memo.
 */
export function gameQuery(gameId: string) {
  return queryOptions({
    queryKey: ["game", gameId],
    queryFn: async (): Promise<ReplayableGame> => {
      const game = await parseResponse(api.games[":id"].$get({ param: { id: gameId } }));
      return { ...game, ...replay(game.rawPgn) };
    },
    // Movetext never changes once imported.
    staleTime: Infinity,
  });
}

/** Exported so leaving the screen can cancel the run it opened. */
export function analysisKey(gameId: string) {
  return ["analyze", gameId] as const;
}

/**
 * Drill count for a game's report — re-fetched from the server, not
 * computed from graded plies, so it can't drift from the drill queue.
 */
export function drillCountQuery(gameId: string) {
  return queryOptions({
    queryKey: ["analysis", gameId, "drills"] as const,
    queryFn: async (): Promise<DrillCount | null> => {
      const state = await parseResponse(
        api.games[":id"].analysis.$get({ param: { id: gameId } }),
      );
      return state.status === "completed" ? (state.drills ?? null) : null;
    },
  });
}

/** One `GradedPly` per chunk, normalising a live stream, a cached report, or a poll/error status. */
export function analysisQuery(gameId: string) {
  return queryOptions({
    queryKey: analysisKey(gameId),
    queryFn: streamedQuery({
      streamFn: ({ signal }) => Promise.resolve(runAnalysis(gameId, signal)),
      // `reset` (the default) blanks the cache on refetch; `replace` keeps the old report on screen until the new run has data.
      refetchMode: "replace",
    }),
    // A 409 is deterministic — retrying would just re-POST the same answer.
    retry: false,
    staleTime: Infinity,
  });
}

/** The stream's vocabulary, matching the route's. `analysis.failed` avoids colliding with `EventSource`'s own `error` event. */
const STREAM_EVENTS = {
  opened: "analysis.opened",
  moveGraded: "analysis.move-graded",
  completed: "analysis.completed",
  failed: "analysis.failed",
} as const;

const WATCHED_EVENTS = [
  STREAM_EVENTS.moveGraded,
  STREAM_EVENTS.completed,
  STREAM_EVENTS.failed,
] as const;

/** The event name is the discriminant, so no payload repeats it as a `type` field. */
const gradedFrameSchema = z.object({
  /** 0-based, and the same number the frame carries as its `id`. */
  index: z.number(),
  total: z.number(),
  position: gradedPlySchema,
});
const completedFrameSchema = z.object({ positions: z.array(gradedPlySchema) });
const failedFrameSchema = z.object({ message: z.string() });

/** Ask, then watch: the POST only enqueues; `GET /analysis/events` reports it, so an `EventSource` can watch. */
async function* runAnalysis(
  gameId: string,
  signal: AbortSignal,
): AsyncGenerator<GradedPly> {
  const state = await parseResponse(
    api.games[":id"].analyze.$post({ param: { id: gameId } }, { init: { signal } }),
  );

  if (state.status === "completed") {
    yield* (state as AnalyzeCompleted).analysis.positions;
    return;
  }

  // The server resumes from `Last-Event-ID`, so a reconnection normally
  // sends only the tail. This stays as the second line of defence: a
  // server that replays more than it had to is still correct, and a move
  // already delivered is dropped rather than counted twice.
  let delivered = -1;
  let yielded = 0;

  for await (const frame of eventsOf(eventsUrl(gameId), signal, WATCHED_EVENTS)) {
    const payload = safeJson(frame.data);

    if (frame.event === STREAM_EVENTS.failed) {
      const failed = failedFrameSchema.safeParse(payload);
      throw new Error(failed.success ? failed.data.message : "analysis failed");
    }

    if (frame.event === STREAM_EVENTS.moveGraded) {
      const graded = gradedFrameSchema.safeParse(payload);
      // Unreadable frames are skipped, not thrown: the run is server-side
      // and the report outlives the connection either way.
      if (!graded.success || graded.data.index <= delivered) continue;
      delivered = graded.data.index;
      // Tracked separately from `index` (0-based): the completed frame's
      // slice below needs a count, not an index.
      yielded += 1;
      yield graded.data.position;
      continue;
    }

    const completed = completedFrameSchema.safeParse(payload);
    if (!completed.success) continue;
    // The terminal frame carries the whole report, so it covers anything
    // the graded frames missed — a watcher that connected late gets all.
    for (const position of completed.data.positions.slice(yielded)) yield position;
    return;
  }
}

function eventsUrl(gameId: string) {
  return `${apiBaseUrl}/games/${encodeURIComponent(gameId)}/analysis/events`;
}

function safeJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * `replayMainline` stops at the first illegal move rather than throwing,
 * so a game from the wild renders as far as it is playable.
 */
function replay(rawPgn: string): { moves: ReplayMove[]; startFen: string } {
  const [game] = parsePgn(rawPgn);
  if (!game) return { moves: [], startFen: STANDARD_START };

  try {
    const replayed = replayMainline(game).unwrap();
    const moves = replayed.moves.map((move, index) => ({
      ply: index + 1,
      san: move.san,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
    }));
    return { moves, startFen: moves[0]?.fenBefore ?? STANDARD_START };
  } catch {
    // Unreadable movetext is still a game with a header worth showing.
    return { moves: [], startFen: STANDARD_START };
  }
}
