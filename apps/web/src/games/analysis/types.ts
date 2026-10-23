/** What an analysis is made of, and what identifies one. */
import { POLICY_VERSION, type GradedPly } from "@velachess/analysis";
import type { EngineUpdate } from "@velachess/infra-engine";
import type { ReplayedGame } from "@velachess/chess";

import { ENGINE_BUILD } from "../../engine/index.ts";

/** Fixed — nothing exposes a depth control. A game graded at another
 * depth is a different answer, so it travels with the report. */
export const ANALYSIS_DEPTH = 14;

/** One spelling for both the query key and the stored record: they must
 * agree, or an older build's report answers for a newer one. */
export const ANALYSIS_IDENTITY = {
  engineBuild: ENGINE_BUILD,
  depth: ANALYSIS_DEPTH,
  policyVersion: POLICY_VERSION,
} as const;

/** Plain JSON, self-describing: what produced it travels with it rather
 * than living in the key. */
export interface GameAnalysisReport {
  gameId: string;
  engineBuild: string;
  depth: number;
  policyVersion: number;
  graded: GradedPly[];
}

export interface GameAnalysisInput {
  gameId: string;
  /** Interpreted once, by whoever loaded the game: a pass never parses
   * a PGN of its own. */
  replay: ReplayedGame;
}

/** The search in progress. A reading this provisional is never graded. */
interface LiveEvaluation {
  /** 1-indexed: the ply whose grade this search unblocks. */
  ply: number;
  fen: string;
  update: EngineUpdate;
}

/** Named once: the union below derives from these. */
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
