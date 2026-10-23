import { POLICY_VERSION, type GradedPly } from "@velachess/analysis";
import type { EngineUpdate } from "@velachess/infra-engine";
import type { ReplayedGame } from "@velachess/chess";

import { ENGINE_BUILD } from "../../engine/index.ts";

/** Nothing exposes a depth control, and a game graded at another depth is a
 * different answer, so it travels with the report. */
export const ANALYSIS_DEPTH = 14;

/** One spelling for the query key and the stored record, which must agree
 * or an older build's report answers for a newer one. */
export const ANALYSIS_IDENTITY = {
  engineBuild: ENGINE_BUILD,
  depth: ANALYSIS_DEPTH,
  policyVersion: POLICY_VERSION,
} as const;

/** Self-describing: what produced it travels with it rather than living in
 * the key. */
export interface GameAnalysisReport {
  gameId: string;
  engineBuild: string;
  depth: number;
  policyVersion: number;
  graded: GradedPly[];
}

export interface GameAnalysisInput {
  gameId: string;
  /** Interpreted by whoever loaded the game: a pass never parses a PGN of
   * its own. */
  replay: ReplayedGame;
}

/** A reading this provisional is never graded. */
interface LiveEvaluation {
  /** The ply whose grade this search unblocks. */
  ply: number;
  fen: string;
  update: EngineUpdate;
}

/** The union below derives from these. */
export const ANALYSIS_EVENT = {
  POSITION_UPDATE: "position-update",
  PLY_GRADED: "ply-graded",
  COMPLETED: "completed",
} as const;

export type AnalysisEvent =
  | { type: typeof ANALYSIS_EVENT.POSITION_UPDATE; live: LiveEvaluation }
  | { type: typeof ANALYSIS_EVENT.PLY_GRADED; grade: GradedPly }
  | { type: typeof ANALYSIS_EVENT.COMPLETED; graded: readonly GradedPly[] };

/** `live` is replaced, never collected: a search's older depths are not
 * history anybody keeps. */
export interface GameAnalysis {
  graded: readonly GradedPly[];
  live: LiveEvaluation | null;
  isComplete: boolean;
}
