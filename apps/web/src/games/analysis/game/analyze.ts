/**
 * `analyzeGame` is handed an evaluator and owns neither the session nor the
 * stored report; `analyzeGameInBrowser` owns both.
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

/** The return value is the completed search a grade is built from. */
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
    // oxlint-disable-next-line eslint/no-await-in-loop -- a stream is pulled one value at a time, and the engine searches one position at a time
    step = await search.next();
  }

  return step.value;
}

/**
 * One search per position: the evaluation after a move is the evaluation
 * before the next one, and a game that ended on its final move takes that
 * score from the rules. A mainline that went illegal part-way is graded up
 * to that point.
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
      // Stored before it is announced, so a consumer that stops reading on
      // the news still leaves the report behind. A failing search throws
      // before this event, so a half-graded game is never stored.
      if (event.type === ANALYSIS_EVENT.COMPLETED) {
        await saveReport(input.gameId, event.graded);
      }
      yield event;
    }
  } finally {
    // A consumer that stops early releases the Worker once the search in
    // flight answers, which the engine's watchdog bounds.
    await evaluator.dispose();
  }
}
