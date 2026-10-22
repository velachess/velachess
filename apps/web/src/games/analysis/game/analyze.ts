/**
 * One whole game, graded ply by ply, as a stream of events.
 *
 * `analyzeGame` decides *which* positions to search and what the answers
 * mean; it is handed an evaluator and owns neither the session nor the
 * stored report. `analyzeGameInBrowser` is the composition around it: a
 * stored report short-circuits before Stockfish is ever started, a
 * finished one is written exactly once, and the session is released
 * whether the pass completes, fails, or the consumer walks away.
 */
import type { ReplayedGame } from "@velachess/chess";
import {
  classifyPly,
  terminalScoreOf,
  type GradedPly,
  type PositionEvaluation,
} from "@velachess/analysis";

import { getReport, saveReport } from "../analysis-db.ts";
import { createStockfishEvaluator } from "../position/stockfish.ts";
import type { PositionEvaluator } from "../position/evaluate.ts";
import { ANALYSIS_EVENT, type AnalysisEvent, type GameAnalysisInput } from "../types.ts";

/** One position, as events — the return value is the completed search a
 * grade may be built from. */
async function* searchPosition(
  evaluator: PositionEvaluator,
  fen: string,
  ply: number,
): AsyncGenerator<AnalysisEvent, PositionEvaluation> {
  const search = evaluator.evaluate(fen);
  let step = await search.next();

  while (!step.done) {
    yield {
      type: ANALYSIS_EVENT.POSITION_UPDATE,
      live: { ply, fen, update: step.value },
    };
    step = await search.next();
  }

  return step.value;
}

/**
 * Grades every ply, emitting each one the moment it is decided. One
 * search per position: the evaluation after a move is the evaluation
 * before the next one, and a game that ended on its final move takes
 * that move's score from the rules rather than a search.
 *
 * A mainline that went illegal part-way is graded up to that point,
 * which is the prefix the board shows.
 */
export async function* analyzeGame(
  replay: ReplayedGame,
  evaluator: PositionEvaluator,
): AsyncGenerator<AnalysisEvent> {
  const firstMove = replay.moves[0];
  if (!firstMove) {
    yield { type: ANALYSIS_EVENT.COMPLETED, graded: [] };
    return;
  }

  const graded: GradedPly[] = [];
  let current = yield* searchPosition(evaluator, firstMove.fenBefore, 1);

  for (const [index, played] of replay.moves.entries()) {
    const ply = index + 1;
    const endedHere = ply === replay.moves.length ? replay.terminal : null;

    const next: PositionEvaluation = endedHere
      ? { score: terminalScoreOf(endedHere), bestMove: null }
      : yield* searchPosition(evaluator, played.fenAfter, ply);

    const grade = classifyPly(ply, played, current, next);
    graded.push(grade);
    yield { type: ANALYSIS_EVENT.PLY_GRADED, grade };
    current = next;
  }

  yield { type: ANALYSIS_EVENT.COMPLETED, graded };
}

export async function* analyzeGameInBrowser(
  input: GameAnalysisInput,
): AsyncGenerator<AnalysisEvent> {
  const stored = await getReport(input.gameId);
  if (stored) {
    yield { type: ANALYSIS_EVENT.COMPLETED, graded: stored.graded };
    return;
  }

  const evaluator = createStockfishEvaluator();
  try {
    for await (const event of analyzeGame(input.replay, evaluator)) {
      // Stored before it is announced, so a consumer that stops reading
      // on hearing the news still leaves the report behind. A failing
      // search throws before this event, so a half-graded game is never
      // stored.
      if (event.type === ANALYSIS_EVENT.COMPLETED) {
        await saveReport(input.gameId, event.graded);
      }
      yield event;
    }
  } finally {
    // A consumer that stops reading early releases the Worker too, after
    // the search in flight answers — the engine's watchdog bounds that.
    await evaluator.dispose();
  }
}
