/**
 * One whole game, graded ply by ply. A stored report short-circuits
 * before Stockfish is ever started.
 *
 * This pass owns its engine session, so halting the task that runs this
 * operation disposes it, which terminates the Worker.
 */
import type { ReplayedGame } from "@velachess/chess";
import { analyzeGame, type GradedPly } from "@velachess/analysis";

import { call, ensure, type Operation } from "../../libs/effection.ts";

import { getReport, saveReport } from "./analysis-db.ts";
import { openPositionEvaluator } from "./evaluate-position-in-browser.ts";

export interface GameAnalysisInput {
  gameId: string;
  /** Already interpreted by `libs/chess`, once, by whoever loaded the
   * game — the pass never parses a PGN of its own. */
  replay: ReplayedGame;
}

/**
 * Plies decided together. A search produces one at a time; a stored
 * report is the whole game at once, and is handed over as such rather
 * than taken apart and reassembled one ply per update.
 */
type PublishPlies = (plies: readonly GradedPly[]) => void;

export function* analyzeGameInBrowser(
  input: GameAnalysisInput,
  publish: PublishPlies,
): Operation<void> {
  const stored = yield* call(() => getReport(input.gameId));
  if (stored) {
    publish(stored.graded);
    return;
  }

  const evaluator = openPositionEvaluator();
  yield* ensure(() => evaluator.dispose());

  // A half-graded game is never stored: an engine failure throws before
  // the write below.
  const graded: GradedPly[] = [];
  yield* analyzeGame(input.replay, evaluator, (position) => {
    graded.push(position);
    publish([position]);
  });

  yield* call(() => saveReport(input.gameId, graded));
}
