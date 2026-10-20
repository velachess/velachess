/**
 * On-demand evaluation for single ad-hoc FENs — the positions of a
 * variation on the review board, not positions from the replayed game.
 *
 * One evaluator holds one engine session for as long as its owner keeps
 * it, so walking a line reuses a single Worker instead of starting one
 * per FEN. The owner is whoever opened it, and `dispose()` is final: see
 * `review/use-variation-evaluation.ts`, which opens one per review and
 * closes it on unmount.
 */
import type { PositionEvaluator } from "@velachess/analysis";
import type { Operation } from "../../../libs/effection.ts";
import { call } from "../../../libs/effection.ts";

import { getCachedRawEval, MULTI_PV, type CacheKeyParts } from "../analysis-cache.ts";
import { cachedPositionEvaluator } from "../cached-position-evaluator.ts";
import { browserEngine, ENGINE_BUILD } from "../../engine/index.ts";

export interface OpenPositionEvaluator extends PositionEvaluator {
  dispose(): Operation<void>;
}

export function openPositionEvaluator(depth: number): OpenPositionEvaluator {
  const parts: CacheKeyParts = { depth, multiPV: MULTI_PV, engineBuild: ENGINE_BUILD };
  const session = browserEngine.createSession({ depth });

  return {
    ...cachedPositionEvaluator({
      search: (fen) => session.evaluate(fen),
      parts,
      lookup: (fen) => call(() => getCachedRawEval(fen, parts)),
    }),
    dispose: () => session.dispose(),
  };
}
