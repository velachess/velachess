/**
 * chessops' parser produces syntactically valid moves, not necessarily
 * legal ones; `replayMainline` is where that gap gets closed.
 */

import { Result } from "@badrap/result";
import {
  emptyHeaders,
  type Game,
  parsePgn,
  type PgnNodeData,
  startingPosition,
} from "chessops/pgn";

import { type FenError, makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import type { Color, Outcome } from "chessops/types";

import { uciOf } from "./moves.ts";
import type { PositionError } from "chessops/chess";

export { emptyHeaders, parsePgn };
export type { Game, PgnNodeData };

/** Plain data, so nothing downstream re-reads a FEN to learn whose turn it
 * was. */
export interface ReplayedMove {
  /** 1-indexed. */
  readonly ply: number;
  readonly san: string;
  readonly uci: string;
  readonly side: Color;
  /** "1. e4" and "1… e5" share one, taken from the position, so a game
   * starting from a FEN at move 20 numbers from 20. */
  readonly moveNumber: number;
  readonly fenBefore: string;
  readonly fenAfter: string;
}

/** Serializable and read-only, so no mutable chessops `Position` escapes
 * this module. */
export interface ReplayedGame {
  /** Honours `[FEN]`/`[SetUp]`, and is correct even with no moves. */
  readonly startFen: string;
  /** False means it stopped at an illegal move, with `moves` holding what
   * came before. */
  readonly legal: boolean;
  /** By the rules, not the `[Result]` header: a resignation has
   * `[Result "1-0"]` and no terminal position. */
  readonly terminal: Outcome | null;
  readonly moves: readonly ReplayedMove[];
}

/** Stops at the first illegal move rather than throwing: a game from the
 * wild is data, not something to assume correct. */
export function replayMainline(
  game: Game<PgnNodeData>,
): Result<ReplayedGame, FenError | PositionError> {
  return startingPosition(game.headers).map((pos) => {
    const startFen = makeFen(pos.toSetup());
    const moves: ReplayedMove[] = [];
    let legal = true;

    for (const node of game.moves.mainline()) {
      const fenBefore = makeFen(pos.toSetup());
      const move = parseSan(pos, node.san);
      if (!move) {
        legal = false;
        break;
      }
      // `uciOf` needs this move's own position to recognise a castle.
      const side = pos.turn;
      const moveNumber = pos.fullmoves;
      const uci = uciOf(pos, move);
      pos.play(move);
      moves.push({
        ply: moves.length + 1,
        san: node.san,
        uci,
        side,
        moveNumber,
        fenBefore,
        fenAfter: makeFen(pos.toSetup()),
      });
    }

    return {
      startFen,
      legal,
      terminal: pos.isEnd() ? (pos.outcome() ?? null) : null,
      moves,
    };
  });
}

/**
 * Headers and at least one legal move: an illegal move further in does not
 * disqualify a game, since the part that replayed is what gets shown.
 */
export function isPlayableGame(
  headers: Map<string, string>,
  replay: ReplayedGame,
): boolean {
  return headers.size > 0 && replay.moves.length > 0;
}

/**
 * chessops accepts non-PGN text as a single game with empty headers and an
 * empty mainline; that case and a thrown PgnError both count as "no
 * playable game".
 */
export function hasPlayableGame(pgn: string): boolean {
  let games: Game<PgnNodeData>[];
  try {
    // emptyHeaders, not the 7-key default, so an absent [Event] tag shows
    // up as headers.size === 0 below.
    games = parsePgn(pgn, emptyHeaders);
  } catch {
    return false;
  }

  return games.some((game) => {
    const replayed = replayMainline(game);
    return replayed.isOk && isPlayableGame(game.headers, replayed.value);
  });
}
