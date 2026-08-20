/**
 * A validated, legal chess position — pieces, turn, castling rights,
 * en passant target. `Chess` is chessops' standard-rules implementation of
 * the abstract `Position`.
 */

import { Result } from "@badrap/result";
import { Chess, type Context, IllegalSetup, PositionError } from "chessops/chess";
import { type FenError, parseFen } from "chessops/fen";

export { Chess, type Context, IllegalSetup, PositionError };
export type { Position } from "chessops/chess";
export type { Outcome } from "chessops/types";

/**
 * FEN string straight to a validated position, in one call — parseFen only
 * checks the FEN is well-formed, Chess.fromSetup separately checks the
 * position is legal (e.g. exactly one king per side). Most callers want
 * both checks done together.
 */
export function positionFromFen(fen: string): Result<Chess, FenError | PositionError> {
  return parseFen(fen).chain((setup) => Chess.fromSetup(setup));
}
