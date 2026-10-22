/**
 * PGN — parsing, and the one replay of a game's mainline. chessops' own
 * parser produces a tree of syntactically valid moves, not necessarily
 * legal ones (its own words); `replayMainline` below is the one place that
 * gap gets closed.
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

/** The PGN vocabulary consumers outside this package actually reach for:
 * parsing raw text, and the parsed game it produces. */
export { emptyHeaders, parsePgn };
export type { Game, PgnNodeData };

/** One half-move of the mainline, as replayed. Everything the readers
 * need is here as plain data: nothing downstream re-reads a FEN to learn
 * whose turn it was or which move number this is. */
export interface ReplayedMove {
  /** 1-indexed. */
  readonly ply: number;
  readonly san: string;
  readonly uci: string;
  readonly side: Color;
  /** The move number this half-move belongs to — "1. e4" and "1… e5"
   * share one. Taken from the position, so a game starting from a FEN at
   * move 20 numbers from 20. */
  readonly moveNumber: number;
  readonly fenBefore: string;
  readonly fenAfter: string;
}

/**
 * One game, interpreted once. Serializable and read-only by contract:
 * this is what the review screen and the analysis pass both consume, so
 * neither has to parse the PGN again, and no mutable chessops `Position`
 * escapes this module.
 */
export interface ReplayedGame {
  /** Honours `[FEN]`/`[SetUp]`, and is correct even with no moves. */
  readonly startFen: string;
  /** Mechanical: the whole mainline replayed. False means it stopped at
   * an illegal move, and `moves` holds what came before. Not the same
   * question as whether the game is worth keeping — see
   * `isPlayableGame`. */
  readonly legal: boolean;
  /** How the game ended *by the rules*, not by its `[Result]` header: a
   * resignation has `[Result "1-0"]` and no terminal position. Null when
   * play simply stopped. */
  readonly terminal: Outcome | null;
  readonly moves: readonly ReplayedMove[];
}

/**
 * Walks a parsed game's mainline, validating and playing each move against
 * the rules. Stops at the first move that isn't legal in the position it's
 * played in, rather than throwing — a game imported from the wild is data,
 * not something we get to assume is correct.
 */
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
      // Read before playing: `pos` is this move's own position, and
      // `uciOf` needs it to recognise a castle.
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
 * Whether a game is worth keeping: it must carry headers and have played
 * at least one legal move. An illegal move further in does not disqualify
 * it — `legal: false` with a non-empty `moves` is still a game, and the
 * part that replayed is what gets shown and analysed.
 *
 * The one place this policy is written. `hasPlayableGame` applies it to
 * raw text; ingestion applies it to a game it has already parsed, so the
 * PGN is never interpreted twice in one operation.
 */
export function isPlayableGame(
  headers: Map<string, string>,
  replay: ReplayedGame,
): boolean {
  return headers.size > 0 && replay.moves.length > 0;
}

/**
 * The one semantic "is this actually a game" check, shared by every layer
 * that must reject arbitrary or malformed text before it reaches
 * persistence: true iff the text parses into at least one game that played
 * at least one legal move. chessops' own parser accepts non-PGN text as a
 * single game with empty headers and an empty mainline (see
 * `normalizeGame`'s comment in libs/infra/platforms/normalize.ts) — that
 * case, and a thrown PgnError, both count as "no playable game".
 */
export function hasPlayableGame(pgn: string): boolean {
  let games: Game<PgnNodeData>[];
  try {
    // Starting from emptyHeaders (not the 7-key default) is what makes an
    // absent [Event] tag show up as headers.size === 0 below — same
    // convention as normalizeGame in libs/infra/platforms/normalize.ts.
    games = parsePgn(pgn, emptyHeaders);
  } catch {
    return false;
  }

  return games.some((game) => {
    const replayed = replayMainline(game);
    return replayed.isOk && isPlayableGame(game.headers, replayed.value);
  });
}
