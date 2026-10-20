/**
 * FEN read/write — a FEN describes a Setup (position state), not yet a
 * validated Position. See position.ts for the step that checks legality.
 */

import { makeFen, parseFen } from "chessops/fen";
import type { Color } from "chessops/types";

export {
  parseFen,
  makeFen,
  INITIAL_FEN,
  EMPTY_FEN,
  FenError,
  InvalidFen,
} from "chessops/fen";
export type { FenOpts } from "chessops/fen";
export type { Setup } from "chessops/setup";

/**
 * EPD position key → playable full FEN. Move counters don't affect the
 * legality of the next move, so zeroed counters are correct for rendering
 * and replaying a stored position.
 */
export function epdToFen(epd: string): string {
  return makeFen(parseFen(epd).unwrap());
}

/**
 * Position identity: EPD (FEN minus halfmove clock/move number), so
 * transposed move orders key the same position.
 */
export function positionKeyOf(fen: string): string {
  return makeFen(parseFen(fen).unwrap(), { epd: true });
}

/**
 * Which side moves in a FEN. Reads the field directly rather than going
 * through `parseFen`, which allocates a whole Setup: this runs once per
 * ply of every analysed game, and a FEN's active-colour field is
 * unambiguous.
 */
export function sideToMoveOf(fen: string): Color {
  return fen.includes(" w ") ? "white" : "black";
}

const FULLMOVE_FIELD = 5;
const FIRST_MOVE = 1;

/**
 * The move number a position belongs to — "1. e4" and "1… e5" share one.
 * Read from the FEN rather than counted off a ply index, because a game
 * can start from a position, at any move number and with either side to
 * play. Falls back to the first move for a FEN without the field, which
 * `makeFen` always writes but a hand-typed one may not.
 */
export function moveNumberOf(fen: string): number {
  const parsed = Number.parseInt(fen.split(" ")[FULLMOVE_FIELD] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : FIRST_MOVE;
}
