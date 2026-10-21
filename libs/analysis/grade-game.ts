/**
 * The pure half of an analysis: given one evaluation per position, say what
 * each move was. No engine, no I/O, no async — `analyze-game.ts` sequences
 * the evaluations and calls in here.
 */

import type { Outcome, ReplayedMove } from "@velachess/chess";

import { classifyMove } from "./classify-move.ts";
import type { MoveCategory } from "./move-category.ts";
import type { PositionEvaluation, WhitePovScore } from "./score.ts";

/**
 * What one move was worth. The move's own identity — its notation and
 * the position it was played from — belongs to the replayed game, which
 * every consumer already has: these line up by `ply`.
 */
export interface GradedPly {
  /** 1-indexed. */
  ply: number;
  evalBefore: WhitePovScore;
  evalAfter: WhitePovScore;
  /** The engine's choice at the position this move was played from,
   * UCI. Null when the engine named none. */
  bestMove: string | null;
  category: MoveCategory;
  winChanceLoss: number;
}

export function terminalScoreOf(terminal: Outcome): WhitePovScore {
  if (terminal.winner) return { mate: terminal.winner === "white" ? 1 : -1 };
  return { cp: 0 };
}

export function classifyPly(
  ply: number,
  played: ReplayedMove,
  current: PositionEvaluation,
  next: PositionEvaluation,
): GradedPly {
  const mover = played.side;
  const { category, winChanceLoss } = classifyMove({
    before: current.score,
    after: next.score,
    mover,
    wasEngineBest: current.bestMove !== null && current.bestMove === played.uci,
  });

  return {
    ply,
    evalBefore: current.score,
    evalAfter: next.score,
    bestMove: current.bestMove,
    category,
    winChanceLoss,
  };
}
