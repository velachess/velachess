/**
 * `Chess` is chessops' standard-rules implementation of the abstract
 * `Position`, and the only variant this app constructs.
 */

import { Result } from "@badrap/result";
import { Chess, type PositionError } from "chessops/chess";
import { type FenError, parseFen } from "chessops/fen";

export type { Position } from "chessops/chess";

/**
 * `parseFen` only checks the FEN is well-formed and `Chess.fromSetup`
 * separately checks the position is legal, which most callers want
 * together.
 */
export function positionFromFen(fen: string): Result<Chess, FenError | PositionError> {
  return parseFen(fen).chain((setup) => Chess.fromSetup(setup));
}
