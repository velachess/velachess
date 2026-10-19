/**
 * Producing and reading evaluations. Stockfish WASM runs here and nowhere
 * else in the app; everything this domain offers is either a search it
 * schedules or a reading of what a search produced.
 *
 * The graded-move vocabulary comes from `@velachess/analysis`, the module
 * that computes it — this app runs that same analysis in the browser, so
 * there is nothing to mirror and one import site for it.
 */
import { engineManager } from "./engine-manager.ts";

export { classifyMove, MOVE_CATEGORIES } from "@velachess/analysis";
export type { GradedPly, MoveCategory } from "@velachess/analysis";

export { startAnalysis } from "./game/index.ts";
export { useEngineAnalysis } from "./use-engine-analysis.ts";

export {
  bestMoveSan,
  evalCurve,
  gradeAtPly,
  moveNumberOf,
  progressPercent,
  sideOfPly,
  summarize,
  whiteShareOf,
} from "./graded-game.ts";
export type { EvalPoint, SideBreakdown } from "./graded-game.ts";

/**
 * One position, searched on the interactive lane: it preempts a
 * whole-game pass and raises `EnginePreempted` once a newer request
 * supersedes it. The scheduler stays private on purpose — a caller asks
 * for an evaluation and does not get to choose a lane.
 */
export const evaluatePosition = engineManager.evaluatePosition;
