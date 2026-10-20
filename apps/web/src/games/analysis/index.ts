/**
 * Producing and reading evaluations. Stockfish WASM runs here and nowhere
 * else in the app; everything this domain offers is either a search it
 * schedules or a reading of what a search produced.
 *
 * The graded-move vocabulary comes from `@velachess/analysis`, the module
 * that computes it — this app runs that same analysis in the browser, so
 * there is nothing to mirror and one import site for it.
 */
export { MOVE_CATEGORIES, scoreToWinChance } from "@velachess/analysis";
export type { GradedPly, MoveCategory, WhitePovScore } from "@velachess/analysis";

export { ANALYSIS_DEPTH } from "./analysis-cache.ts";
export { startAnalysis } from "./game/index.ts";
export { useEngineAnalysis } from "./use-engine-analysis.ts";

/**
 * Opens an evaluator for the positions someone explores by hand. It
 * holds one engine session, so its owner keeps it for as long as those
 * positions keep coming and disposes it when they stop.
 */
export { openPositionEvaluator } from "./position/index.ts";
export type { OpenPositionEvaluator } from "./position/index.ts";
