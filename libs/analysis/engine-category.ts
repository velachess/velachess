import type { WhitePovScore } from "./score.ts";

export type MoveCategory = "best" | "good" | "inaccuracy" | "mistake" | "blunder";
export type EngineCategory = "ok" | "inaccuracy" | "mistake" | "blunder";

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

/** The 5-category report scale collapsed to the deviations table's severity enum. */
export function toEngineCategory(category: MoveCategory): EngineCategory {
  return category === "best" || category === "good" ? "ok" : category;
}
