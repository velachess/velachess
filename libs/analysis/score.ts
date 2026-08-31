/**
 * UCI engines report scores from the side to move's point of view.
 * Everything downstream of this package works in white POV — the
 * conversion happens here, once, instead of at every callsite.
 */

import type { EngineScore } from "@velachess/infra-engine";

export interface WhitePovScore {
  cp?: number;
  mate?: number;
}

export function toWhitePov(
  score: EngineScore,
  sideToMove: "white" | "black",
): WhitePovScore {
  if (sideToMove === "white") return { ...score };
  const flipped: WhitePovScore = {};
  if (score.cp !== undefined) flipped.cp = -score.cp;
  if (score.mate !== undefined) flipped.mate = -score.mate;
  return flipped;
}
