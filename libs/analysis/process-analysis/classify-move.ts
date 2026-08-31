import type { MoveCategory } from "../engine-category.ts";
import type { WhitePovScore } from "../score.ts";
import { CP_CEILING, winChance } from "../winchance.ts";

const BLUNDER = 0.3;
const MISTAKE = 0.2;
const INACCURACY = 0.1;

export interface ClassifyInput {
  /** Eval of the position before the move, white POV. */
  before: WhitePovScore;
  /** Eval of the position after the played move, white POV. */
  after: WhitePovScore;
  mover: "white" | "black";
  /** The played move equals the engine's first PV move at `before`. */
  wasEngineBest: boolean;
}

/** Mate-aware wrapper `analyzeGame`'s own eval-to-win-chance conversion
 * needs — a mate score maps to the ±1000cp ceiling, not a saturated ±1.
 * Exported from index.ts for apps/web/src/games/analysis-read.ts, the
 * one consumer outside this module's graph. */
export function scoreToWinChance(score: {
  cp?: number | undefined;
  mate?: number | undefined;
}): number {
  if (score.mate !== undefined)
    return winChance(score.mate > 0 ? CP_CEILING : -CP_CEILING);
  return winChance(score.cp ?? 0);
}

export function classifyMove(input: ClassifyInput): {
  category: MoveCategory;
  winChanceLoss: number;
} {
  const sign = input.mover === "white" ? 1 : -1;
  const loss = Math.max(
    0,
    (scoreToWinChance(input.before) - scoreToWinChance(input.after)) * sign,
  );

  if (input.wasEngineBest) return { category: "best", winChanceLoss: loss };
  if (loss >= BLUNDER) return { category: "blunder", winChanceLoss: loss };
  if (loss >= MISTAKE) return { category: "mistake", winChanceLoss: loss };
  if (loss >= INACCURACY) return { category: "inaccuracy", winChanceLoss: loss };
  return { category: "good", winChanceLoss: loss };
}
