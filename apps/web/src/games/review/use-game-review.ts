/**
 * The review's React boundary: the one file that knows the state is held
 * in a zustand store, so the screens only know the domain.
 *
 * It owns no state of its own, synchronizes nothing, and runs nothing —
 * `review-store.ts` owns the state and its transitions, and
 * `use-variation-evaluation.ts` owns the engine call.
 */
import { createContext, useContext, useState } from "react";
import { useStore } from "zustand";

import {
  createReviewStore,
  type ReplayNavigation,
  type ReviewGame,
  type ReviewState,
  type ReviewStore,
} from "./review-store.ts";

export {
  REPLAY_NAVIGATION,
  selectCanGoBack,
  selectCanGoForward,
  selectFen,
  selectLastMove,
  selectShowingSan,
  selectTotalPlies,
} from "./review-store.ts";
export type {
  ReplayNavigation,
  ReplayNavigationEvent,
  ReviewGame,
  ReviewState,
  Variation,
} from "./review-store.ts";

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
