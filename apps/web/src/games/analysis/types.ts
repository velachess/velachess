/**
 * What an analysis is made of, and what identifies one.
 *
 * Every shape here is either the engine's or `@velachess/analysis`'s —
 * `EngineUpdate`, `GradedPly`, `PositionEvaluation` are imported, never
 * restated. What this file adds is the event stream a whole-game pass
 * produces and the accumulated reading a consumer keeps.
 */
import { POLICY_VERSION, type GradedPly } from "@velachess/analysis";
import type { EngineUpdate } from "@velachess/infra-engine";
import type { ReplayedGame } from "@velachess/chess";

import { ENGINE_BUILD } from "../../engine/index.ts";

/** Fixed — nothing exposes a depth control. Recorded on the report it
 * produces: a game graded at another depth is a different answer. */
export const ANALYSIS_DEPTH = 14;

/**
 * What produced a grade. Three values, one spelling: the query key that
 * caches a report and the record that stores it must agree, or a report
 * searched by an older build answers for a newer one.
 */
export const ANALYSIS_IDENTITY = {
  engineBuild: ENGINE_BUILD,
  depth: ANALYSIS_DEPTH,
  policyVersion: POLICY_VERSION,
} as const;

/** Plain JSON, self-describing: the same document a backend would be
 * handed later, which is why what produced it travels with it instead of
 * living in the key. */
export interface GameAnalysisReport {
  gameId: string;
  engineBuild: string;
  depth: number;
  policyVersion: number;
  graded: GradedPly[];
}

export interface GameAnalysisInput {
  gameId: string;
  /** Already interpreted by `libs/chess`, once, by whoever loaded the
   * game — a pass never parses a PGN of its own. */
  replay: ReplayedGame;
}

/**
 * The search in progress, carrying the position it is about. A reading
 * this provisional is never graded; it exists so a screen can show that
 * the engine is working and how deep it has gone.
 */
interface LiveEvaluation {
  /** The 1-indexed ply whose grade this search unblocks. */
  ply: number;
  fen: string;
  update: EngineUpdate;
}

/** What a pass reports, named once: the union below is derived from
 * these, so a consumer matching on a name cannot spell one that does not
 * exist. */
export const ANALYSIS_EVENT = {
  POSITION_UPDATE: "position-update",
  PLY_GRADED: "ply-graded",
  COMPLETED: "completed",
} as const;

export type AnalysisEvent =
  | { type: typeof ANALYSIS_EVENT.POSITION_UPDATE; live: LiveEvaluation }
  | { type: typeof ANALYSIS_EVENT.PLY_GRADED; grade: GradedPly }
  | { type: typeof ANALYSIS_EVENT.COMPLETED; graded: readonly GradedPly[] };

/** Every event folded into one reading. `live` is replaced, never
 * collected: a search's older depths are not history anybody keeps. */
export interface GameAnalysis {
  graded: readonly GradedPly[];
  live: LiveEvaluation | null;
  isComplete: boolean;
}
