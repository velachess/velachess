/**
 * Which graded plies are worth drilling. Not a severity floor — measured over real games (~342 plies: 48 blunders,
 * 36 inaccuracies, 22 mistakes), a fixed floor either starves strong players or drowns beginners. Volume instead
 * ranks by cost and cuts at a budget (self-calibrating); `minSeverity` stays only as an absolute "never drill a fine move" floor.
 */

import { severeEnough, type Severity } from "./eligibility.ts";

/**
 * Structural shape from a jsonb row, not a class.
 * `category` is the four-value severity (report's five collapsed via `toEngineCategory` by the caller) — this package never learns a second scale.
 */
export interface DrillablePly {
  ply: number;
  category: Severity;
  /** How much the move cost, 0–1. The ranking is on this rather than on
   * the category, because "blunder" is a bucket and this is the number
   * the bucket was derived from. */
  winChanceLoss: number;
}

export interface SelectionOptions {
  /** How many drills one game may contribute. */
  budget?: number;
  /** Lowest severity that still drills at all. */
  minSeverity?: Exclude<Severity, "ok">;
}

/**
 * Five a game is a sitting, not a chore. With the distribution measured
 * above it lands around four or five per game once the opponent's side is
 * excluded.
 */
const DEFAULT_BUDGET = 5;

export function selectDrillCandidates<T extends DrillablePly>(
  plies: readonly T[],
  opts: SelectionOptions = {},
): T[] {
  const budget = opts.budget ?? DEFAULT_BUDGET;
  if (budget <= 0) return [];

  return plies
    .filter((ply) => severeEnough(ply.category, opts.minSeverity))
    .toSorted(byCostThenPly)
    .slice(0, budget);
}

/**
 * Worst first. Ties break on ply so the same report always yields the
 * same list — `toSorted` is stable, but the array it receives is not
 * guaranteed to arrive in a fixed order, and a drill set that shuffles
 * between runs would make the count on screen unreproducible.
 */
function byCostThenPly(a: DrillablePly, b: DrillablePly): number {
  return b.winChanceLoss - a.winChanceLoss || a.ply - b.ply;
}
