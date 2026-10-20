/**
 * Where the engine's vocabulary becomes the analysis domain's: a
 * `CompletedSearch` (side-to-move score, raw bestmove string) turns into a
 * `PositionEvaluation` (white POV, null for "no move"), and the IndexedDB cache sits
 * in front of it so a position already searched under the same parameters
 * never reaches Stockfish twice.
 */
import { call, type Operation } from "../../libs/effection.ts";
import { sideToMoveOf } from "@velachess/chess";
import {
  toWhitePov,
  type PositionEvaluator,
  type PositionEvaluation,
} from "@velachess/analysis";
import type { CompletedSearch } from "@velachess/infra-engine";

import { putCachedRawEval, type CacheKeyParts } from "./analysis-cache.ts";

/** UCI's "no legal move" bestmove, which is not a move. */
const NO_MOVE = "(none)";

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

export interface CachedEvaluatorDeps {
  /** The engine call for one position. Narrow on purpose: this adapter
   * needs a search, not a session to manage. */
  search: (fen: string) => Operation<CompletedSearch>;
  parts: CacheKeyParts;
  /**
   * The cache read. A whole-game pass hands in a map pre-warmed by one
   * IndexedDB transaction; a single ad-hoc FEN reads the store directly.
   * Writes always go straight to the store, since one search result is
   * cheap to persist on its own.
   */
  lookup: (fen: string) => Operation<PositionEvaluation | null>;
}

export function cachedPositionEvaluator(deps: CachedEvaluatorDeps): PositionEvaluator {
  const { search, parts, lookup } = deps;

  return {
    *evaluate(fen: string): Operation<PositionEvaluation> {
      const cached = yield* lookup(fen);
      if (cached) return cached;

      const raw = positionEvaluationOf(fen, yield* search(fen));
      yield* call(() => putCachedRawEval(fen, parts, raw));
      return raw;
    },
  };
}
