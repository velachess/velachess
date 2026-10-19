/**
 * The review's React boundary: the one file that knows the state is held
 * in a zustand store, so nothing else has to.
 *
 * It owns no state, synchronizes nothing and runs nothing. The screens do
 * not call it either — `use-board-review.ts` and
 * `use-analysis-panel-review.ts` are what they consume.
 */
import { createContext, useContext, useState } from "react";
import { useStore } from "zustand";

import type { ReplayNavigation, ReviewGame } from "./review-model.ts";
import { createReviewStore, type ReviewState, type ReviewStore } from "./review-store.ts";

const ReviewStoreContext = createContext<ReviewStore | null>(null);

export const ReviewStoreProvider = ReviewStoreContext.Provider;

/** One store per review, built from the game it is a review of. */
export function useCreateReviewStore(
  game: ReviewGame,
  onNavigate: ReplayNavigation,
): ReviewStore {
  const [store] = useState(() => createReviewStore({ game, onNavigate }));
  return store;
}

export function useGameReview<Selected>(
  selector: (state: ReviewState) => Selected,
): Selected {
  const store = useContext(ReviewStoreContext);
  if (!store) throw new Error("useGameReview was called outside a review screen");
  return useStore(store, selector);
}
