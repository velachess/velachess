/**
 * One exploratory move, evaluated and graded. Pulled out of
 * `use-move-exploration.ts` so the hook holds only the interaction and
 * its state: this is the whole of what the engine is asked and how the
 * answer is read, in one operation with no React in it.
 *
 * Concurrency is not decided here. `EngineManager` already preempts
 * whatever holds the engine for an `interactive` request, which is what
 * makes the newest exploration the one that gets answered.
 */
import type { PlayedMove } from "@velachess/chess";
import { sideToMoveOf } from "@velachess/chess";

import { classifyMove, type GradedPly, type MoveCategory } from "../analysis-contract.ts";
import type { Operation } from "../../libs/effection.ts";
import { engineManager } from "../browser-analysis/index.ts";

/** Matches `use-browser-analysis.ts`'s own literal — no depth control
 * exposed anywhere in this app yet, for the real review or exploration. */
const EXPLORATION_DEPTH = 14;

export interface ExplorationVerdict {
  category: MoveCategory;
  winChanceLoss: number;
}

export function* exploreMove(
  startFen: string,
  played: PlayedMove,
  grade: GradedPly,
): Operation<ExplorationVerdict> {
  const raw = yield* engineManager.evaluatePosition({
    fen: played.fen,
    depth: EXPLORATION_DEPTH,
  });

  return classifyMove({
    before: grade.evalBefore,
    after: raw.score,
    mover: played.mover,
    // The engine's bestMove is only known for the position's real side to
    // move — dragging the other side's piece (exploring what it could
    // have played instead) has no engine opinion to compare against, so
    // it can never register as "best".
    wasEngineBest:
      played.mover === sideToMoveOf(startFen) && grade.bestMove === played.uci,
  });
}
