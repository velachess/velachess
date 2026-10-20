/**
 * [ANALYSIS] — what a chess move was worth, and nothing about how the
 * engine that said so is driven.
 *
 * Analysis runs entirely in `apps/web/src/games/analysis/`
 * (Stockfish WASM, Web Worker, no server round-trip — see PR #155). This
 * module owns the per-ply sequencing (`analyzeGame`) and the pure
 * score/win-chance/move-category policies the result is read through,
 * nothing else: no job, no table, no route, no engine session and no
 * cache. The engine reaches it through the `PositionEvaluator` dependency
 * it declares; watchdogs, retries and session recovery belong to
 * `@velachess/infra-engine`.
 */

export { analyzeGame, fensToEvaluate } from "./analyze-game.ts";
export type { PositionEvaluator, PublishPly } from "./analyze-game.ts";

export { gradeGame } from "./grade-game.ts";
export type { GradedPly } from "./grade-game.ts";

/** The move vocabulary itself, for consumers that render it — `apps/web`
 * reads the ordered list for the report's rows instead of restating it. */
export { MOVE_CATEGORIES } from "./move-category.ts";
export type { MoveCategory } from "./move-category.ts";

/** `toWhitePov` is exported for the one caller that bridges engine scores
 * into this module's vocabulary: `apps/web`'s cached position evaluator. */
export { toWhitePov } from "./score.ts";
export type { PovScore, RawEval, WhitePovScore } from "./score.ts";

export { classifyMove, scoreToWinChance } from "./classify-move.ts";
export type { ClassifyInput } from "./classify-move.ts";

export { POLICY_VERSION } from "./policy-version.ts";
