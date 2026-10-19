import { queryOptions } from "../../libs/react-query.ts";

import { parsePgn, replayMainline } from "@velachess/chess";

import { api, parseResponse, type InferResponseType } from "../../api/index.ts";
import { gameQueryKey } from "../game-query-keys.ts";

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
    queryKey: [...gameQueryKey, gameId],
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

/** A ply is one half-move. Ply 0 is the position before anyone moved. */
export function fenAtPly(
  moves: readonly ReplayMove[],
  startFen: string,
  ply: number,
): string {
  if (ply <= 0) return startFen;
  return moves[Math.min(ply, moves.length) - 1]?.fenAfter ?? startFen;
}
