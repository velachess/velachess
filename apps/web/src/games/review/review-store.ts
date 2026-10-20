/**
 * One review instance's state and its actions. Every rule it applies
 * lives in `review-model.ts`; this file holds the state, reads it with
 * `get`, and writes what a transition decided with `set`.
 *
 * It runs nothing. It does not know about Effection, the Worker or the
 * scheduler — `use-variation-evaluation.ts` asks the engine and hands the
 * answer back through `variationEvaluated`.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  goToPlyState,
  initialReviewState,
  nextReviewState,
  playVariationMove,
  previousReviewState,
  variationFen,
  type ReplayNavigation,
  type ReviewData,
  type ReviewGame,
  type ReviewTransition,
} from "./review-model.ts";

interface ReviewActions {
  goToPly: (ply: number) => void;
  next: () => void;
  previous: () => void;
  /** False when the position does not allow the move — nothing changes. */
  playMove: (from: string, to: string) => boolean;
  variationEvaluated: (fen: string, score: ReviewData["variationEvaluation"]) => void;
  showBest: (san: string) => void;
}

export type ReviewState = ReviewData & ReviewActions;

export type ReviewStore = StoreApi<ReviewState>;

export function createReviewStore({
  game,
  onNavigate,
}: {
  game: ReviewGame;
  onNavigate?: ReplayNavigation | undefined;
}): ReviewStore {
  return createStore<ReviewState>((set, get) => {
    const apply = (transition: ReviewTransition | null): void => {
      if (!transition) return;
      set(transition.data);
      if (transition.announce) onNavigate?.(transition.announce);
    };

    return {
      ...initialReviewState(game),

      goToPly: (ply) => apply(goToPlyState(get(), ply)),
      next: () => apply(nextReviewState(get())),
      previous: () => apply(previousReviewState(get())),

      playMove(from, to) {
        const variation = playVariationMove(get(), from, to);
        if (!variation) return false;

        set({ variation });
        return true;
      },

      variationEvaluated(fen, score) {
        // An answer is only about the position it was asked for. The
        // board may have moved on while the engine searched, and a number
        // from a position nobody is looking at is not this position's.
        if (variationFen(get().variation) !== fen) return;
        set({ variationEvaluation: score });
      },

      showBest: (san) => set({ preview: san }),
    };
  });
}
