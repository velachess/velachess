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

const UNREADABLE: ReplayedGame = {
  startFen: INITIAL_FEN,
  legal: false,
  terminal: null,
  moves: [],
};

/**
 * The one interpretation of this game's PGN. `replayMainline` stops at the
 * first illegal move rather than throwing, so a game from the wild renders
 * as far as it is playable — and the analysis pass reads this same result
 * instead of parsing the movetext again.
 */
function replay(rawPgn: string): ReplayedGame {
  const [game] = parsePgn(rawPgn);
  if (!game) return UNREADABLE;

  // Unreadable movetext is still a game with a header worth showing.
  return replayMainline(game).unwrap(
    (replayed) => replayed,
    () => UNREADABLE,
  );
}

/** A ply is one half-move. Ply 0 is the position before anyone moved. */
export function fenAtPly(
  moves: readonly ReplayedMove[],
  startFen: string,
  ply: number,
): string {
  if (ply <= 0) return startFen;
  return moves[Math.min(ply, moves.length) - 1]?.fenAfter ?? startFen;
}
