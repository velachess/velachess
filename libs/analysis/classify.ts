import type { WhitePovScore } from "./score.ts";
import { scoreToWinChance } from "./winchance.ts";

export type MoveCategory = "best" | "good" | "inaccuracy" | "mistake" | "blunder";
export type EngineCategory = "ok" | "inaccuracy" | "mistake" | "blunder";

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

/** The 5-category report scale collapsed to the deviations table's severity enum. */
export function toEngineCategory(category: MoveCategory): EngineCategory {
  return category === "best" || category === "good" ? "ok" : category;
}

/** Eval drop in centipawns from the mover's POV. Null when either side is a mate score. */
export function cpLoss(
  before: WhitePovScore,
  after: WhitePovScore,
  mover: "white" | "black",
): number | null {
  if (before.cp === undefined || after.cp === undefined) return null;
  const sign = mover === "white" ? 1 : -1;
  return (before.cp - after.cp) * sign;
}
