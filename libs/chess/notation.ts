/**
 * SAN — the human-readable notation. `makeSan`/`makeSanVariation` do not
 * mutate the position passed in (they clone internally); `parseSan` never
 * mutates either.
 */

export { makeSan, makeSanVariation, parseSan } from "chessops/san";

/**
 * Plies are 1-indexed half-moves: White plays the odd ones. Every
 * attribution of a move to a player rests on this.
 */
export function sideOfPly(ply: number): "white" | "black" {
  return ply % 2 === 1 ? "white" : "black";
}

/** The move number a ply belongs to — "1. e4" and "1… e5" share one. */
export function moveNumberOf(ply: number): number {
  return Math.ceil(ply / 2);
}
