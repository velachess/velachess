/**
 * One review, wired: the store that holds its state, the sound its
 * navigation makes, the engine call its variation needs, and the arrow
 * keys that step it.
 *
 * Composition only. Every rule is `review-model.ts`'s, every transition
 * the store's, and every search Effection's — this hook decides none of
 * them, it only puts them in the same place so a screen does not have to.
 */
import { useHotkeys } from "react-hotkeys-hook";

import { createReplayNavigation } from "./review-navigation.ts";
import type { ReviewGame } from "./review-model.ts";
import type { SeatedGame } from "./review-presentation.ts";
import type { ReviewStore } from "./review-store.ts";
import { useCreateReviewStore } from "./use-game-review.ts";
import { useVariationEvaluation } from "./use-variation-evaluation.ts";

export function useReviewSession(game: ReviewGame & SeatedGame): ReviewStore {
  const store = useCreateReviewStore(game, createReplayNavigation(game));

  useVariationEvaluation(store);

  // Ignored while a form field has focus (react-hotkeys-hook default) —
  // an arrow key stepping the board while someone types elsewhere would
  // be the wrong kind of clever.
  useHotkeys("left", () => store.getState().previous(), { preventDefault: true }, [
    store,
  ]);
  useHotkeys("right", () => store.getState().next(), { preventDefault: true }, [store]);

  return store;
}
