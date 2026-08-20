/**
 * Game phase from a FEN's major/minor piece count alone — Lichess's
 * game-division heuristic (lila's `Divider`), minus the "mixedness" signal
 * that needs move history. Thresholds are theirs, kept as-is so phase labels
 * match what players already read as opening/middlegame/endgame.
 */

export type GamePhase = "opening" | "middlegame" | "endgame";

export const PHASE_ORDER: readonly GamePhase[] = ["opening", "middlegame", "endgame"];

/** Majors + minors at or below this: endgame. */
const ENDGAME_MAX_MAJORS_MINORS = 6;
/** Majors + minors at or below this: no longer an opening. */
const MIDDLEGAME_MAX_MAJORS_MINORS = 10;
/** A back rank with fewer pieces than this reads as developed. */
const BACKRANK_SPARSE_BELOW = 4;

const MAJORS_AND_MINORS = new Set(["q", "r", "b", "n", "Q", "R", "B", "N"]);

/**
 * Classify the position `fen` describes. Total over anything shaped like
 * a FEN: only the placement field is read, and unknown characters count
 * as nothing.
 */
export function gamePhaseOf(fen: string): GamePhase {
  const placement = fen.split(" ")[0] ?? "";
  const ranks = placement.split("/");

  let majorsMinors = 0;
  for (const character of placement) {
    if (MAJORS_AND_MINORS.has(character)) majorsMinors++;
  }

  if (majorsMinors <= ENDGAME_MAX_MAJORS_MINORS) return "endgame";
  if (majorsMinors <= MIDDLEGAME_MAX_MAJORS_MINORS) return "middlegame";
  if (backrankSparse(ranks[0]) || backrankSparse(ranks[7])) return "middlegame";
  return "opening";
}

/** FEN ranks list black's back rank first (index 0) and white's last (7). */
function backrankSparse(rank: string | undefined): boolean {
  if (rank === undefined) return false;

  let pieces = 0;
  for (const character of rank) {
    if (/[a-zA-Z]/.test(character)) pieces++;
  }
  return pieces < BACKRANK_SPARSE_BELOW;
}
