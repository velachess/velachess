/**
 * PGN — parsing, writing, the game tree, and comment annotations
 * ([%clk], [%eval], [%csl]/[%cal]). chessops' own parser produces a tree
 * of syntactically valid moves, not necessarily legal ones (its own words);
 * `replayMainline` below is the one place that gap gets closed.
 */

import { Result } from "@badrap/result";
import {
  Box,
  type ChildNode,
  type Comment,
  type CommentShape,
  type CommentShapeColor,
  defaultHeaders,
  emptyHeaders,
  type Evaluation,
  type EvaluationMate,
  type EvaluationPawns,
  extend,
  type Game,
  isChildNode,
  isMate,
  isPawns,
  makeComment,
  makeOutcome,
  makePgn,
  type Node,
  parseComment,
  parseOutcome,
  type ParseOptions,
  parsePgn,
  PgnError,
  type PgnNodeData,
  PgnParser,
  setStartingPosition,
  startingPosition,
  transform,
  walk,
} from "chessops/pgn";

import { type FenError, makeFen } from "./fen.ts";
import type { Move } from "./moves.ts";
import { parseSan } from "./notation.ts";
import type { Position, PositionError } from "./position.ts";

export {
  Box,
  type ChildNode,
  type Comment,
  type CommentShape,
  type CommentShapeColor,
  defaultHeaders,
  emptyHeaders,
  type Evaluation,
  type EvaluationMate,
  type EvaluationPawns,
  extend,
  type Game,
  isChildNode,
  isMate,
  isPawns,
  makeComment,
  makeOutcome,
  makePgn,
  type Node,
  parseComment,
  parseOutcome,
  type ParseOptions,
  parsePgn,
  PgnError,
  type PgnNodeData,
  PgnParser,
  setStartingPosition,
  startingPosition,
  transform,
  walk,
};

export interface ReplayedMove {
  san: string;
  move: Move;
  fenBefore: string;
  fenAfter: string;
}

export interface ReplayedGame {
  moves: ReplayedMove[];
  finalPosition: Position;
  /** False if the mainline stopped early — `moves` holds what came before that. */
  legal: boolean;
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
    const moves: ReplayedMove[] = [];
    let legal = true;

    for (const node of game.moves.mainline()) {
      const fenBefore = makeFen(pos.toSetup());
      const move = parseSan(pos, node.san);
      if (!move) {
        legal = false;
        break;
      }
      pos.play(move);
      moves.push({ san: node.san, move, fenBefore, fenAfter: makeFen(pos.toSetup()) });
    }

    return { moves, finalPosition: pos, legal };
  });
}

/**
 * Minimal movetext emitter: SAN list → "1. e4 e6 2. d4 *". The inverse of
 * replayMainline for repertoire lines — no headers, no variations.
 */
export function sansToPgn(sans: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    const moveNumber = i / 2 + 1;
    const white = sans[i];
    const black = sans[i + 1];
    parts.push(black ? `${moveNumber}. ${white} ${black}` : `${moveNumber}. ${white}`);
  }
  return parts.length > 0 ? `${parts.join(" ")} *` : "*";
}
