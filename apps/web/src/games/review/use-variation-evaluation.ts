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
 */
import { useEffect, useRef } from "react";
import { useStore } from "zustand";

import { openPositionEvaluator, type OpenPositionEvaluator } from "../analysis/index.ts";
import { run } from "../../libs/effection.ts";

import { variationFen } from "./review-model.ts";
import type { ReviewStore } from "./review-store.ts";

export function useVariationEvaluation(store: ReviewStore): void {
  const fen = useStore(store, (state) => variationFen(state.variation));
  const evaluatorRef = useRef<OpenPositionEvaluator | null>(null);

  /**
   * Cleared before it is disposed, so a remount opens a fresh evaluator
   * instead of reaching for a disposed one.
   */
  useEffect(
    () => () => {
      const evaluator = evaluatorRef.current;
      evaluatorRef.current = null;
      if (evaluator) void run(() => evaluator.dispose()).catch(() => {});
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

    let cancelled = false;
    const evaluator = (evaluatorRef.current ??= openPositionEvaluator());
    const evaluation = run(() => evaluator.evaluate(fen));

    evaluation.then(
      (raw) => {
        if (!cancelled) store.getState().variationEvaluated(fen, raw.score);
      },
      () => {
        // `SearchSuperseded` when a newer position took the engine, or a
        // real engine failure: neither has a number to show, and neither
        // is a reason to throw away the moves someone played.
      },
    );

    return () => {
      cancelled = true;
      // `halt()` hands back a lazy handle: the task is interrupted only
      // once that handle is consumed, and consuming it rejects.
      void evaluation.halt().catch(() => {});
    };
  }, [fen, store]);
}
