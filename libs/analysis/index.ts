/**
 * [ANALYSIS] — what a chess move was worth, and nothing about how the
 * engine that said so is driven.
 *
 * Analysis runs entirely in `apps/web/src/games/analysis/`
 * (Stockfish WASM, Web Worker, no server round-trip — see PR #155). This
 * module owns only the pure policies a result is read through: the
 * white-POV conversion, the win-chance curve, the per-ply grading and the
 * move vocabulary. No job, no table, no route, no engine session, no
 * cache, and no sequencing — which positions to search, in which order,
 * is the web slice's `games/analysis/game/analyze.ts`.
 */

export { classifyPly, terminalScoreOf } from "./grade-game.ts";
export type { GradedPly } from "./grade-game.ts";

/** The move vocabulary itself, for consumers that render it — `apps/web`
 * reads the ordered list for the report's rows instead of restating it. */
export { MOVE_CATEGORIES } from "./move-category.ts";
export type { MoveCategory } from "./move-category.ts";

/** `toWhitePov` is exported for the one caller that bridges engine scores
 * into this module's vocabulary: `apps/web`'s Stockfish evaluator. */
export { toWhitePov } from "./score.ts";
export type { PositionEvaluation, WhitePovScore } from "./score.ts";

export { classifyMove, scoreToWinChance } from "./classify-move.ts";

export { POLICY_VERSION } from "./policy-version.ts";
