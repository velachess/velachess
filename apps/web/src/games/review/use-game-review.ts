/**
 * The review's React boundary: the one file that knows the state is held
 * in a zustand store, so nothing else has to.
 *
 * It owns no state, synchronizes nothing and runs nothing: the store is
 * built by the screen and reaches everything else through this context.
 */
import { createContext, useContext } from "react";
import { useStore } from "zustand";

import type { ReviewState, ReviewStore } from "./review-store.ts";

const ReviewStoreContext = createContext<ReviewStore | null>(null);

export const ReviewStoreProvider = ReviewStoreContext.Provider;

export function useGameReview<Selected>(
  selector: (state: ReviewState) => Selected,
): Selected {
  const store = useContext(ReviewStoreContext);
  if (!store) throw new Error("useGameReview was called outside a review screen");
  return useStore(store, selector);
}
