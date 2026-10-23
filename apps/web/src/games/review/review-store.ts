/**
 * Every rule it applies lives in `review-model.ts`; this file holds the
 * state and writes what a transition decided.
 *
 * The game is a closure rather than state, and needs no staleness guard:
 * movetext never changes once imported, and `game-review.tsx`'s
 * `key={gameId}` rebuilds the store for a different game.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  goToPlyState,
  INITIAL_REVIEW,
  nextReviewState,
  playVariationMove,
  previousReviewState,
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
  revealBestMove: () => void;
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
      ...INITIAL_REVIEW,

      goToPly: (ply) => apply(goToPlyState(get(), game, ply)),
      next: () => apply(nextReviewState(get(), game)),
      previous: () => apply(previousReviewState(get(), game)),

      playMove(from, to) {
        const variation = playVariationMove(get(), game, from, to);
        if (!variation) return false;

        set({ variation });
        return true;
      },

      revealBestMove: () => set({ showBestMove: true }),
    };
  });
}
