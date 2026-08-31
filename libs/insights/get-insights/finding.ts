/**
 * The envelope every insight source fills, and the one ranking over all of them.
 * Lives in the slice, not a domain library — it's the cross-source contract; a domain package importing it would invert the enforced dependency direction.
 */

import type { AdherenceFinding } from "./adherence-finding.ts";

import type { OpeningWeaknessFinding } from "./opening-weakness.ts";
import type { PerformanceTrendFinding } from "./performance-trend.ts";
import type { PhasePerformanceFinding } from "./phase-performance.ts";
import type { RecurringMistakeFinding } from "./recurring-mistake.ts";
import type { WinningPositionBlundersFinding } from "./winning-position-blunders.ts";

/**
 * Which evidence tier a finding stands on. `all-games` reads facts every imported game carries (no engine needed);
 * `analysed-games` reads per-move grades from deep analysis. Split keeps a half-analysed history honest — neither tier claims the other's sample.
 */
export type FindingScope = "all-games" | "analysed-games";

/** How much of the history stands behind this request. It describes
 * the dataset, not any one claim — which is why it lives once on the
 * response envelope instead of repeating on every finding. Per-claim
 * samples live in each finding's own evidence. */
export interface EvidenceCoverage {
  gamesConsidered: number;
  deeplyAnalysedGames: number;
  /** deeplyAnalysedGames / gamesConsidered; 0 over an empty history. */
  coverage: number;
}

/** What each kind's facts require. Deliberately a table, not a field on
 * the sources: a source cannot claim a wider tier than its inputs. */
export const KIND_SCOPE = {
  "book-advantage": "all-games",
  "book-disadvantage": "all-games",
  "opening-weakness": "all-games",
  "performance-trend": "all-games",
  "phase-performance": "analysed-games",
  "recurring-mistake": "analysed-games",
  "winning-position-blunders": "analysed-games",
} as const satisfies Record<string, FindingScope>;

/** Adherence rides with its section here — the domain package reports
 * the comparison; where it sits on the screen is this slice's call. */
export type SourceFinding =
  | (AdherenceFinding & { section: "openings" })
  | OpeningWeaknessFinding
  | PhasePerformanceFinding
  | RecurringMistakeFinding
  | WinningPositionBlundersFinding
  | PerformanceTrendFinding;

export type Finding = SourceFinding & {
  scope: FindingScope;
};

/** The whole answer: the dataset's coverage even when nothing cleared a
 * floor — an empty list with no context is indistinguishable from a
 * broken one, and "you have 3 analysed games out of 200" is exactly the
 * explanation an empty screen needs. */
export interface InsightsReport {
  coverage: EvidenceCoverage;
  findings: Finding[];
}

/**
 * Biggest measured effect first, ties broken on id for a stable order.
 * Caveat: `weight` is each finding's own unit (win-rate delta, per-move rate delta, or conversion rate) — comparing
 * across units isn't real arithmetic, so per-move findings rank systematically below per-game ones until a common currency exists.
 */
export function rankFindings<T extends { id: string; weight: number }>(
  findings: readonly T[],
): T[] {
  return findings.toSorted((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
}
