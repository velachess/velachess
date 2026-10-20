/**
 * The pure half of an analysis: given one evaluation per position, say what
 * each move was. No engine, no I/O, no async — `analyze-game.ts` sequences
 * the evaluations and calls in here.
 */

import type { Position, ReplayedMove } from "@velachess/chess";
import { makeUci, sideToMoveOf } from "@velachess/chess";

import { classifyMove } from "./classify-move.ts";
import type { MoveCategory } from "./move-category.ts";
import type { RawEval, WhitePovScore } from "./score.ts";

export interface GradedPly {
  /** 1-indexed. */
  ply: number;
  /** FEN before the move. */
  fen: string;
  san: string;
  evalBefore: WhitePovScore;
  evalAfter: WhitePovScore;
  /** Engine's preferred move at `fen`, UCI. */
  bestMove: string;
  category: MoveCategory;
  winChanceLoss: number;
}

export function terminalScoreOf(finalPosition: Position): WhitePovScore {
  const outcome = finalPosition.outcome();
  if (outcome?.winner) return { mate: outcome.winner === "white" ? 1 : -1 };
  return { cp: 0 };
}

export function classifyPly(
  ply: number,
  played: ReplayedMove,
  current: RawEval,
  next: RawEval,
): GradedPly {
  const mover = sideToMoveOf(played.fenBefore);
  const { category, winChanceLoss } = classifyMove({
    before: current.score,
    after: next.score,
    mover,
    wasEngineBest: current.bestMove !== null && current.bestMove === makeUci(played.move),
  });

  return {
    ply,
    fen: played.fenBefore,
    san: played.san,
    evalBefore: current.score,
    evalAfter: next.score,
    bestMove: current.bestMove ?? "",
    category,
    winChanceLoss,
  };
}

/**
 * Grades every ply from one evaluation per position. `evals` must align
 * with `fensToEvaluate(...)` for the same `moves`/`finalPosition` — one
 * entry per FEN, in the same order, omitting the terminal position when the
 * game ended on the last move.
 */
export function gradeGame(
  moves: ReplayedMove[],
  finalPosition: Position,
  evals: readonly RawEval[],
): GradedPly[] {
  const total = moves.length;
  if (total === 0) return [];

  const positions: GradedPly[] = [];
  let current = evals[0]!;

  for (let i = 0; i < total; i++) {
    const played = moves[i]!;
    const isLast = i === total - 1;
    const next: RawEval =
      isLast && finalPosition.isEnd()
        ? { score: terminalScoreOf(finalPosition), bestMove: null }
        : evals[i + 1]!;

    positions.push(classifyPly(i + 1, played, current, next));
    current = next;
  }

  return positions;
}
