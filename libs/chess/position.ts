/**
 * A validated, legal chess position. `Chess` is chessops' standard-rules
 * implementation of the abstract `Position` — and the only variant this
 * app constructs, so a Chess960 game gets no castling.
 */

import { Result } from "@badrap/result";
import { Chess, type PositionError } from "chessops/chess";
import { type FenError, parseFen } from "chessops/fen";

export type { Position } from "chessops/chess";

/**
 * FEN string straight to a validated position, in one call — parseFen only
 * checks the FEN is well-formed, Chess.fromSetup separately checks the
 * position is legal (e.g. exactly one king per side). Most callers want
 * both checks done together.
 */
export function positionFromFen(fen: string): Result<Chess, FenError | PositionError> {
  return parseFen(fen).chain((setup) => Chess.fromSetup(setup));
}
