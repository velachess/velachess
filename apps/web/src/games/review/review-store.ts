/**
 * One review instance's state and its actions: the ply on screen, the line
 * someone is trying out, and whether they asked to see the engine's move.
 * Nothing else — the game itself and everything the engine produced are
 * React Query's, and copying either here would make one fact answerable
 * from two places.
 *
 * Every rule it applies lives in `review-model.ts`; this file holds the
 * state, reads it with `get`, and writes what a transition decided with
 * `set`. It runs nothing: no Effection, no Worker, no engine.
 *
 * The game is a closure, not state. It cannot go stale: a replay is this
 * game's movetext, which never changes once imported, and the screen
 * rebuilds the store for a different game (`key={gameId}` in
 * `game-review.tsx`), so a refetch can only hand back the same answer.
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
  /** Draws the engine's move for the ply on screen. The move is read from
   * the report; this only records that someone asked for it. */
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
