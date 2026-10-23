/**
 * What a move was worth, and nothing about how the engine that said so is
 * driven: no session, no cache and no sequencing, which positions to search
 * being `apps/web`'s `games/analysis/game/analyze.ts`.
 */

export { classifyPly, terminalScoreOf } from "./grade-game.ts";
export type { GradedPly } from "./grade-game.ts";

/** The order `apps/web` draws the report's rows in. */
export { MOVE_CATEGORIES } from "./move-category.ts";
export type { MoveCategory } from "./move-category.ts";

/** For the one caller that bridges engine scores into this vocabulary. */
export { toWhitePov } from "./score.ts";
export type { PositionEvaluation, WhitePovScore } from "./score.ts";

export { classifyMove, scoreToWinChance } from "./classify-move.ts";

export { POLICY_VERSION } from "./policy-version.ts";
