/**
 * Producing and reading evaluations. Stockfish WASM runs here and nowhere
 * else in the app; who starts a pass and accumulates it is not this
 * module's business.
 */
export { MOVE_CATEGORIES, scoreToWinChance } from "@velachess/analysis";
export type { GradedPly, MoveCategory, WhitePovScore } from "@velachess/analysis";

export { analyzeGameInBrowser } from "./game/analyze.ts";

/** One engine session per evaluator: its owner keeps it while positions
 * keep coming and disposes it when they stop. */
export { createStockfishEvaluator } from "./position/stockfish.ts";
export type { PositionEvaluator, PositionSearch } from "./position/evaluate.ts";

export { ANALYSIS_EVENT, ANALYSIS_IDENTITY } from "./types.ts";
export type { AnalysisEvent, GameAnalysis } from "./types.ts";
