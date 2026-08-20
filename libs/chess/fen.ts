/**
 * FEN read/write — a FEN describes a Setup (position state), not yet a
 * validated Position. See position.ts for the step that checks legality.
 */

import { makeFen, parseFen } from "chessops/fen";

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
 * and answering a drilling position.
 */
export function epdToFen(epd: string): string {
  return makeFen(parseFen(epd).unwrap());
}

/**
 * Position identity for drilling: EPD (FEN minus halfmove clock/move
 * number), so transposed move orders and different origins (repertoire vs
 * engine) key the same position instead of seeding it twice.
 */
export function positionKeyOf(fen: string): string {
  return makeFen(parseFen(fen).unwrap(), { epd: true });
}
