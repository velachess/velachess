/**
 * One whole game, graded ply by ply, with the cache wrapped around the
 * engine rather than inside it: a cached report short-circuits before
 * Stockfish is ever started, and otherwise every FEN the game needs is
 * batch-read from the rawEval store in one IndexedDB transaction up front.
 * That pre-warmed map is the `lookup` the evaluator checks, so a hit costs
 * nothing and a miss searches exactly as before.
 *
 * This pass owns its engine session, so the session's lifetime is the
 * pass's: halting the task that runs this operation disposes it, which
 * quits the engine and terminates its Worker.
 */
import { parsePgn, replayMainline } from "@velachess/chess";
import {
  analyzeGame,
  fensToEvaluate,
  POLICY_VERSION,
  type GradedPly,
  type PublishPly,
} from "@velachess/analysis";
import { call, ensure, type Operation } from "../../../libs/effection.ts";

import {
  getCachedRawEvalsBatch,
  getCachedReport,
  putCachedReport,
  MULTI_PV,
  type CacheKeyParts,
} from "../analysis-cache.ts";
import { cachedPositionEvaluator } from "../cached-position-evaluator.ts";
import { browserEngine, ENGINE_BUILD } from "../../engine/index.ts";

export interface GameAnalysisInput {
  gameId: string;
  rawPgn: string;
  depth: number;
}

export function* analyzeGameInBrowser(
  input: GameAnalysisInput,
  publish: PublishPly,
): Operation<void> {
  const [game] = parsePgn(input.rawPgn);
  if (!game) return;

  const parts: CacheKeyParts = {
    depth: input.depth,
    multiPV: MULTI_PV,
    engineBuild: ENGINE_BUILD,
  };

  const cachedReport = yield* call(() =>
    getCachedReport(input.gameId, POLICY_VERSION, parts),
  );
  if (cachedReport) {
    for (const ply of cachedReport) publish(ply);
    return;
  }

  const replay = replayMainline(game).unwrap();
  const prefetched = yield* call(() =>
    getCachedRawEvalsBatch(fensToEvaluate(replay), parts),
  );

  const session = browserEngine.createSession({ depth: input.depth });
  yield* ensure(() => session.dispose());
  const evaluator = cachedPositionEvaluator({
    search: (fen) => session.evaluate(fen),
    parts,
    lookup: (fen) => call(() => prefetched.get(fen) ?? null),
  });

  // Collected here rather than inside `analyzeGame` because persisting the
  // report is this layer's business, and a half-graded game is never
  // written: an engine failure throws before this line is reached.
  const positions: GradedPly[] = [];
  yield* analyzeGame(game, evaluator, (position) => {
    positions.push(position);
    publish(position);
  });

  yield* call(() => putCachedReport(input.gameId, POLICY_VERSION, parts, positions));
}
