/**
 * UCI engines report from the side to move's point of view and everything
 * downstream works in white POV, so the conversion happens here once.
 */

/** Relative to the side to move. Declared here rather than imported, and
 * structurally the engine's `EngineScore`, so a shape change there fails to
 * compile where the two are bridged. */
export interface PovScore {
  cp?: number;
  mate?: number;
}

export interface WhitePovScore {
  cp?: number;
  mate?: number;
}

/** White POV, and nothing about the move it preceded. `bestMove` is UCI,
 * null when the engine had none to offer. */
export interface PositionEvaluation {
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
