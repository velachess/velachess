/**
 * The engine's answer for the position a variation is showing: asked for
 * here, cancelled here, and held here rather than in the review's state.
 *
 * The session is this review's: opened by the first position that needs
 * it, kept while someone keeps walking the line — so one Worker answers
 * every position instead of one per FEN — and disposed when the screen
 * goes away. Nothing else may dispose it, and the whole-game pass has a
 * session of its own that this one neither waits for nor interrupts.
 */
import { useEffect, useRef, useState } from "react";

import type { WhitePovScore } from "@velachess/analysis";

import {
  createStockfishEvaluator,
  type PositionEvaluator,
  type PositionSearch,
} from "../analysis/index.ts";

/** Only the finished search has a number worth showing, and the stream's
 * return value is where it is — which `for await` would discard. */
async function settledEvaluation(search: PositionSearch) {
  let step = await search.next();
  while (!step.done) step = await search.next();
  return step.value;
}

/** An answer carries the position it is about: it is shown for that FEN
 * and for no other. */
interface Answered {
  fen: string;
  score: WhitePovScore;
}

/** `fen` is the position on the board, or null when the game's own is. */
export function useVariationEvaluation(fen: string | null): WhitePovScore | null {
  const evaluatorRef = useRef<PositionEvaluator | null>(null);
  const [answered, setAnswered] = useState<Answered | null>(null);

  /**
   * Cleared before it is disposed, so a remount opens a fresh evaluator
   * instead of reaching for a disposed one.
   */
  useEffect(
    () => () => {
      const evaluator = evaluatorRef.current;
      evaluatorRef.current = null;
      if (evaluator) void evaluator.dispose().catch(() => {});
    },
    [],
  );

  /**
   * React's cleanup is the rule: everything that makes this position stop
   * being the one on screen — a further move, the line ending, the screen
   * going away — runs the same teardown, so
   * the engine is told to stop instead of being left searching for an
   * answer nobody will read. `cancel()` is what reaches the search: a
   * generator's `return()` would queue behind the `next()` already
   * pending. The session survives that teardown; only the search is
   * cancelled.
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
        // A stop, a newer position that took the engine, or a real engine
        // failure: none has a number to show, and none is a reason to
        // throw away the moves someone played.
      },
    );

    return () => {
      asked = false;
      search.cancel();
    };
  }, [fen]);

  return answered?.fen === fen ? answered.score : null;
}
