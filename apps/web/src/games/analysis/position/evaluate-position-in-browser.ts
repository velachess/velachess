/**
 * On-demand evaluation for a single ad-hoc FEN — one position of a
 * variation on the review board, not a position from the replayed
 * game. Checked against the cache before the engine is started at all: a
 * whole-game pass can amortize a session over hundreds of positions, a
 * single FEN cannot.
 */
import { call, type Operation } from "../../../libs/effection.ts";
import type { RawEval } from "@velachess/analysis";
import { useEngineEvaluator } from "@velachess/infra-engine";

import {
  getCachedRawEval,
  putCachedRawEval,
  MULTI_PV,
  type CacheKeyParts,
} from "../analysis-cache.ts";
import { rawEvalOf } from "../cached-position-evaluator.ts";
import { ENGINE_BUILD } from "../engine-asset.ts";
import { openBrowserEngineSession } from "../open-browser-engine-session.ts";

export interface PositionInput {
  fen: string;
  depth: number;
}

export function* evaluatePositionInBrowser(input: PositionInput): Operation<RawEval> {
  const parts: CacheKeyParts = {
    depth: input.depth,
    multiPV: MULTI_PV,
    engineBuild: ENGINE_BUILD,
  };

  const cached = yield* call(() => getCachedRawEval(input.fen, parts));
  if (cached) return cached;

  const engine = yield* useEngineEvaluator(openBrowserEngineSession, {
    depth: input.depth,
  });
  const raw = rawEvalOf(input.fen, yield* engine.evaluate(input.fen));
  yield* call(() => putCachedRawEval(input.fen, parts, raw));
  return raw;
}
