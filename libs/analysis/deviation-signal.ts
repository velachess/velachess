import type { GradedPly } from "./process-analysis/analyze-game.ts";
import type { EngineCategory } from "./engine-category.ts";
import { cpLoss, toEngineCategory } from "./engine-category.ts";

/**
 * Crosses a deviation's ply with an analyzed game to produce the severity
 * signal the deviations table stores. Null when the analysis doesn't reach
 * that ply.
 */
export function engineSignalForDeviation(
  positions: GradedPly[],
  deviationPly: number,
): { cpLoss: number | null; engineCategory: EngineCategory } | null {
  const position = positions.find((p) => p.ply === deviationPly);
  if (!position) return null;

  const mover = position.fen.includes(" w ") ? "white" : "black";
  return {
    cpLoss: cpLoss(position.evalBefore, position.evalAfter, mover),
    engineCategory: toEngineCategory(position.category),
  };
}
