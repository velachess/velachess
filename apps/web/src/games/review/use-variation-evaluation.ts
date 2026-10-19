/**
 * The one place a variation's position is sent to the engine, and the one
 * place that search is cancelled.
 *
 * Concurrency is not decided here. `EngineManager` already preempts
 * whatever holds the engine for an `interactive` request, which is what
 * makes the newest position the one that gets answered, and the
 * per-position cache is what makes walking back down a line free.
 */
import { useEffect } from "react";
import { useStore } from "zustand";

import { ANALYSIS_DEPTH, evaluatePosition } from "../analysis/index.ts";
import { run } from "../../libs/effection.ts";

import { variationFen, type ReviewStore } from "./review-store.ts";

export function useVariationEvaluation(store: ReviewStore): void {
  const fen = useStore(store, (state) => variationFen(state.variation));

  /**
   * React's cleanup is the rule: everything that makes this position stop
   * being the one on screen — a further move, walking the line back, the
   * variation ending, the screen going away — runs the same teardown, so
   * the engine is handed back instead of being left searching for an
   * answer nobody will read. The whole-game pass is not this file's to
   * cancel, and it is not cancelled.
   */
  useEffect(() => {
    if (fen === null) return;

    let cancelled = false;
    const evaluation = run(() => evaluatePosition({ fen, depth: ANALYSIS_DEPTH }));

    evaluation.then(
      (raw) => {
        if (!cancelled) store.getState().variationEvaluated(fen, raw.score);
      },
      () => {
        // `EnginePreempted` when a newer position took the engine, or a
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
