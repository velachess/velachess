/**
 * [ANALYSIS] — what a chess move was worth, and nothing about how the
 * engine that said so is driven: the white-POV conversion, the win-chance
 * curve, the per-ply grading and the move vocabulary. No session, no
 * cache, and no sequencing — which positions to search is the web
 * slice's `games/analysis/game/analyze.ts`.
 */

export { classifyPly, terminalScoreOf } from "./grade-game.ts";
export type { GradedPly } from "./grade-game.ts";

/** The ordered list `apps/web` draws the report's rows from. */
export { MOVE_CATEGORIES } from "./move-category.ts";
export type { MoveCategory } from "./move-category.ts";

/** For the one caller that bridges engine scores into this vocabulary:
 * `apps/web`'s Stockfish evaluator. */
export { toWhitePov } from "./score.ts";
export type { PositionEvaluation, WhitePovScore } from "./score.ts";

export { classifyMove, scoreToWinChance } from "./classify-move.ts";

export { POLICY_VERSION } from "./policy-version.ts";
