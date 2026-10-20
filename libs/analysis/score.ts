/**
 * UCI engines report scores from the side to move's point of view.
 * Everything downstream of this package works in white POV — the
 * conversion happens here, once, instead of at every callsite.
 */

/** A score as an engine reports it: relative to the side to move. Declared
 * here rather than imported so this module owns both halves of its own
 * score vocabulary; it is structurally the engine's `EngineScore`, so a
 * shape change there fails to compile at the callsite that bridges them. */
export interface PovScore {
  cp?: number;
  mate?: number;
}

export interface WhitePovScore {
  cp?: number;
  mate?: number;
}

/** One position's evaluation, white POV — nothing about the move it
 * preceded. `bestMove` is UCI, null when the engine had no move to offer. */
export interface RawEval {
  score: WhitePovScore;
  bestMove: string | null;
}

export function toWhitePov(
  score: PovScore,
  sideToMove: "white" | "black",
): WhitePovScore {
  if (sideToMove === "white") return { ...score };
  const flipped: WhitePovScore = {};
  if (score.cp !== undefined) flipped.cp = -score.cp;
  if (score.mate !== undefined) flipped.mate = -score.mate;
  return flipped;
}
