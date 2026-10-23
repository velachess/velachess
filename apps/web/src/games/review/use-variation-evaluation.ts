/**
 * One session for the whole review, so one Worker answers every position
 * of a line instead of one per FEN. The whole-game pass has a session of
 * its own that this one neither waits for nor interrupts.
 */
import { useEffect, useRef, useState } from "react";

import type { WhitePovScore } from "@velachess/analysis";

import {
  createStockfishEvaluator,
  type PositionEvaluator,
  type PositionSearch,
} from "../analysis/index.ts";

/** The finished number is the stream's return value, which `for await`
 * would discard. */
async function settledEvaluation(search: PositionSearch) {
  let step = await search.next();
  // oxlint-disable-next-line eslint/no-await-in-loop -- draining a stream is sequential by definition: the next value exists only once this one arrived
  while (!step.done) step = await search.next();
  return step.value;
}

interface Answered {
  fen: string;
  score: WhitePovScore;
}

export function useVariationEvaluation(fen: string | null): WhitePovScore | null {
  const evaluatorRef = useRef<PositionEvaluator | null>(null);
  const [answered, setAnswered] = useState<Answered | null>(null);

  // Cleared before disposing, so a remount opens a fresh evaluator
  // instead of reaching for a disposed one.
  useEffect(
    () => () => {
      const evaluator = evaluatorRef.current;
      evaluatorRef.current = null;
      if (evaluator) void evaluator.dispose().catch(() => {});
    },
    [],
  );

  /**
   * `cancel()` is what reaches the search, not the generator's `return()`,
   * which would queue behind the `next()` already pending. The session
   * survives the teardown; only the search is cancelled.
   */
  useEffect(() => {
    if (fen === null) return;

    const evaluator = (evaluatorRef.current ??= createStockfishEvaluator());
    const search = evaluator.evaluate(fen);
    let asked = true;

    void settledEvaluation(search).then(
      (settled) => {
        // A result that beat its own cancellation is not this position's.
        if (asked) setAnswered({ fen, score: settled.score });
      },
      () => {
        // A stop, a superseded search or a dead engine: no number to show.
      },
    );

    return () => {
      asked = false;
      search.cancel();
    };
  }, [fen]);

  return answered?.fen === fen ? answered.score : null;
}
