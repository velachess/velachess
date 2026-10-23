/**
 * Where the engine's vocabulary becomes the domain's, and the only place
 * here that opens a session — one Worker per evaluator, reused for every
 * FEN.
 */
import { parseFen } from "@velachess/chess";
import { toWhitePov, type PositionEvaluation } from "@velachess/analysis";
import type { CompletedSearch, EngineUpdate } from "@velachess/infra-engine";

import { run } from "../../../libs/effection.ts";
import { browserEngine } from "../../../engine/index.ts";
import type { EngineSessionHandle } from "../../../engine/index.ts";
import { ANALYSIS_DEPTH } from "../types.ts";
import type { PositionEvaluator, PositionSearch } from "./evaluate.ts";

/** UCI's "no legal move" bestmove, which is not a move. */
const NO_MOVE = "(none)";

export function positionEvaluationOf(
  fen: string,
  search: CompletedSearch,
): PositionEvaluation {
  // `unwrap` on purpose: every FEN here was written by `makeFen`, so a
  // malformed one is a bug worth hearing about rather than a score
  // silently flipped to the wrong side.
  const score = search.lastInfo
    ? toWhitePov(search.lastInfo.score, parseFen(fen).unwrap().turn)
    : {};
  return {
    score,
    bestMove: search.bestMove.move === NO_MOVE ? null : search.bestMove.move,
  };
}

/** The one place the engine's Effection task becomes an async iterator,
 * so no consumer of Analysis holds a task or spells a UCI command. */
function searchPosition(session: EngineSessionHandle, fen: string): PositionSearch {
  const pending: EngineUpdate[] = [];
  let wake: (() => void) | null = null;
  let finished = false;

  function notify(): void {
    const resume = wake;
    wake = null;
    resume?.();
  }

  const task = run(() =>
    session.evaluate(fen, (update) => {
      pending.push(update);
      notify();
    }),
  );

  const settled = task.then(
    (search) => {
      finished = true;
      notify();
      return positionEvaluationOf(fen, search);
    },
    (error: unknown) => {
      finished = true;
      notify();
      throw error;
    },
  );
  // An abandoned stream would otherwise report an unhandled rejection
  // as a crash rather than a stopped search.
  void settled.catch(() => {});

  function cancel(): void {
    if (finished) return;
    finished = true;
    // `halt()` hands back a lazy handle: the task is interrupted only
    // once that handle is consumed, and consuming it rejects.
    void task.halt().catch(() => {});
    notify();
  }

  async function* stream(): AsyncGenerator<EngineUpdate, PositionEvaluation> {
    try {
      while (true) {
        while (pending.length > 0) yield pending.shift()!;
        if (finished) break;
        // oxlint-disable-next-line eslint/no-await-in-loop -- waits for the next line this one search produces; there is no second search to run beside it
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      return await settled;
    } finally {
      cancel();
    }
  }

  return Object.assign(stream(), { cancel });
}

export function createStockfishEvaluator(
  depth: number = ANALYSIS_DEPTH,
): PositionEvaluator {
  const session = browserEngine.createSession({ depth });

  return {
    evaluate: (fen) => searchPosition(session, fen),
    dispose: async () => {
      await run(() => session.dispose());
    },
  };
}
