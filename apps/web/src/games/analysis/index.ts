/**
 * Producing and reading evaluations. Stockfish WASM runs here and nowhere
 * else in the app; everything this domain offers is either a search it
 * schedules or a reading of what a search produced.
 *
 * A whole game is an `AsyncIterable` of events — React Query is what
 * starts it, accumulates it and hands it to a screen, and nothing in here
 * knows that. The graded-move vocabulary comes from `@velachess/analysis`,
 * the module that computes it: this app runs that same policy in the
 * browser, so there is nothing to mirror and one import site for it.
 */
export { MOVE_CATEGORIES, scoreToWinChance } from "@velachess/analysis";
export type { GradedPly, MoveCategory, WhitePovScore } from "@velachess/analysis";

export { analyzeGameInBrowser } from "./game/analyze.ts";

/**
 * Opens an evaluator for the positions someone explores by hand. It
 * holds one engine session, so its owner keeps it for as long as those
 * positions keep coming and disposes it when they stop.
 */
export { createStockfishEvaluator } from "./position/stockfish.ts";
export type { PositionEvaluator, PositionSearch } from "./position/evaluate.ts";

export { ANALYSIS_EVENT, ANALYSIS_IDENTITY } from "./types.ts";
export type { AnalysisEvent, GameAnalysis } from "./types.ts";
