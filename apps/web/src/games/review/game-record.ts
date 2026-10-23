import { queryOptions } from "../../libs/react-query.ts";

import {
  INITIAL_FEN,
  parsePgn,
  replayMainline,
  type ReplayedGame,
  type ReplayedMove,
} from "@velachess/chess";

import { api, parseResponse, type InferResponseType } from "../../api/index.ts";
import { gameQueryKey } from "../game-query-keys.ts";

type GameResponse = InferResponseType<(typeof api.games)[":id"]["$get"], 200>;

export type ReplayableGame = GameResponse & ReplayedGame;

/**
 * Parsing sits in the fetch, so React Query caches the result and stepping
 * never re-parses.
 */
export function gameQuery(gameId: string) {
  return queryOptions({
    queryKey: [...gameQueryKey, gameId],
    queryFn: async (): Promise<ReplayableGame> => {
      const game = await parseResponse(api.games[":id"].$get({ param: { id: gameId } }));
      return { ...game, ...replay(game.rawPgn) };
    },
    staleTime: Infinity,
  });
}

const UNREADABLE: ReplayedGame = {
  startFen: INITIAL_FEN,
  legal: false,
  terminal: null,
  moves: [],
};

/**
 * `replayMainline` stops at the first illegal move rather than throwing, so
 * a game from the wild renders as far as it is playable, and the analysis
 * pass reads this same result.
 */
function replay(rawPgn: string): ReplayedGame {
  const [game] = parsePgn(rawPgn);
  if (!game) return UNREADABLE;

  return replayMainline(game).unwrap(
    (replayed) => replayed,
    () => UNREADABLE,
  );
}

/** Ply 0 is the position before anyone moved. */
export function fenAtPly(
  moves: readonly ReplayedMove[],
  startFen: string,
  ply: number,
): string {
  if (ply <= 0) return startFen;
  return moves[Math.min(ply, moves.length) - 1]?.fenAfter ?? startFen;
}
