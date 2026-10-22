/**
 * The one place a variation's position is sent to the engine, the one
 * place that search is cancelled, and the owner of the engine session
 * behind both.
 *
 * The session is this review's: opened by the first position that needs
 * it, kept while someone keeps walking the line — so one Worker answers
 * every position instead of one per FEN — and disposed when the review
 * goes away. Nothing else may dispose it, and the whole-game pass has a
 * session of its own that this one neither waits for nor interrupts.
 *
 * This is Position Evaluation on its own: exploring a line asks for one
 * position and never starts a whole-game analysis or reads its report.
 */
import { useEffect, useRef } from "react";
import { useStore } from "zustand";

import {
  createStockfishEvaluator,
  type PositionEvaluator,
  type PositionSearch,
} from "../analysis/index.ts";

import { variationFen } from "./review-model.ts";
import type { ReviewStore } from "./review-store.ts";

/** Only the finished search has a number worth showing, and the stream's
 * return value is where it is — which `for await` would discard. */
async function settledEvaluation(search: PositionSearch) {
  let step = await search.next();
  while (!step.done) step = await search.next();
  return step.value;
}

export function useVariationEvaluation(store: ReviewStore): void {
  const fen = useStore(store, (state) => variationFen(state.variation));
  const evaluatorRef = useRef<PositionEvaluator | null>(null);

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
   * being the one on screen — a further move, walking the line back, the
   * variation ending, the screen going away — runs the same teardown, so
   * the engine is told to stop instead of being left searching for an
   * answer nobody will read. The session survives that teardown; only the
   * search is cancelled.
   */
  useEffect(() => {
    if (fen === null) return;

    const evaluator = (evaluatorRef.current ??= createStockfishEvaluator());
    const search = evaluator.evaluate(fen);

    void settledEvaluation(search).then(
      // The store refuses an answer about a position that is no longer on
      // the board, so a result that beats its own cancellation is caught
      // there rather than by a flag here.
      (evaluation) => store.getState().variationEvaluated(fen, evaluation.score),
      () => {
        // A stop, a newer position that took the engine, or a real engine
        // failure: none has a number to show, and none is a reason to
        // throw away the moves someone played.
      },
    );

    return () => search.cancel();
  }, [fen, store]);
}
