import { queryOptions } from "../libs/react-query.ts";
import { z } from "../libs/zod.ts";

import { parsePgn, replayMainline } from "@velachess/chess";

import { api, parseResponse, type InferResponseType } from "../api/index.ts";

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

type GameResponse = InferResponseType<(typeof api.games)[":id"]["$get"], 200>;

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
