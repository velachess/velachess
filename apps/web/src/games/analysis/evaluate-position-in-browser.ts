/**
 * Where the engine's vocabulary becomes the analysis domain's, and the
 * only place in this domain that opens an engine session.
 *
 * One evaluator holds one session for as long as its owner keeps it, so
 * walking a line reuses a single Worker instead of starting one per FEN,
 * and `dispose()` is final.
 */
import { sideToMoveOf } from "@velachess/chess";
import {
  toWhitePov,
  type PositionEvaluation,
  type PositionEvaluator,
} from "@velachess/analysis";
import type { CompletedSearch } from "@velachess/infra-engine";

import type { Operation } from "../../libs/effection.ts";
import { browserEngine } from "../../engine/index.ts";

/** UCI's "no legal move" bestmove, which is not a move. */
const NO_MOVE = "(none)";

/** Fixed — nothing exposes a depth control. Recorded on the report it
 * produces: a game graded at another depth is a different answer. */
export const ANALYSIS_DEPTH = 14;

export function positionEvaluationOf(
  fen: string,
  search: CompletedSearch,
): PositionEvaluation {
  const score = search.lastInfo
    ? toWhitePov(search.lastInfo.score, sideToMoveOf(fen))
    : {};
  return {
    score,
    bestMove: search.bestMove.move === NO_MOVE ? null : search.bestMove.move,
  };
}

export interface OpenPositionEvaluator extends PositionEvaluator {
  dispose(): Operation<void>;
}

export function openPositionEvaluator(): OpenPositionEvaluator {
  const session = browserEngine.createSession({ depth: ANALYSIS_DEPTH });

  return {
    *evaluate(fen: string): Operation<PositionEvaluation> {
      return positionEvaluationOf(fen, yield* session.evaluate(fen));
    },
    dispose: () => session.dispose(),
  };
}
