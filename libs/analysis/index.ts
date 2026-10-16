/**
 * [ANALYSIS] — the pure Stockfish analysis algorithm and its classifying
 * policies, with no persistence or queue of its own.
 *
 * Analysis runs entirely in `apps/web/src/games/browser-analysis/`
 * (Stockfish WASM, Web Worker, no server round-trip — see PR #155). This
 * module owns the per-ply search/classify loop (`analyzeGame`) and the
 * pure score/win-chance/move-category policies the result is read
 * through, nothing else: no job, no table, no route.
 *
 * `score.ts`/`winchance.ts`/`classify-move.ts` are module-level pure
 * policies (no DB/queue dependency of their own).
 */

export {
  analyzeGame,
  evaluatePositions,
  fensToEvaluate,
  gradeGame,
} from "./process-analysis/analyze-game.ts";
export type {
  AnalysisEvent,
  AnalyzeOptions,
  GradedPly,
  RawEval,
  RawEvalCache,
} from "./process-analysis/analyze-game.ts";

/** The move vocabulary itself, for consumers that render it — `apps/web`
 * reads the ordered list for the report's rows instead of restating it. */
export { MOVE_CATEGORIES } from "./move-category.ts";
export type { MoveCategory } from "./move-category.ts";
export type { WhitePovScore } from "./score.ts";

export { classifyMove, scoreToWinChance } from "./classify-move.ts";
export type { ClassifyInput } from "./classify-move.ts";

export { POLICY_VERSION } from "./policy-version.ts";
