import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { MoveNav } from "@velachess/ui/chess/move-nav";

import { selectCanGoBack, selectCanGoForward, type ReviewGame } from "./review-model.ts";
import { useGameReview } from "./use-game-review.ts";

const CONTROLS_COPY = {
  previous: msg`Previous move`,
  next: msg`Next move`,
  navigation: msg`Move navigation`,
  previousShort: msg`Prev`,
  nextShort: msg`Next`,
} as const;

/**
 * `sticky bottom-0`: on mobile the panel above this scrolls the page, so
 * without it Prev/Next would sit below a long game's graph, tabs and
 * result. `bg-card` covers what scrolls underneath once pinned, and both
 * are no-ops at `lg`.
 */
export interface ReplayControlsProps {
  game: ReviewGame;
}

export function ReplayControls({ game }: ReplayControlsProps) {
  const { i18n } = useLingui();

  const canGoBack = useGameReview(selectCanGoBack);
  const canGoForward = useGameReview((state) => selectCanGoForward(state, game));
  const previous = useGameReview((state) => state.previous);
  const next = useGameReview((state) => state.next);

  return (
    <MoveNav
      className="sticky bottom-0 border-t bg-card"
      copy={{
        navigation: i18n._(CONTROLS_COPY.navigation),
        previous: i18n._(CONTROLS_COPY.previous),
        next: i18n._(CONTROLS_COPY.next),
        previousShort: i18n._(CONTROLS_COPY.previousShort),
        nextShort: i18n._(CONTROLS_COPY.nextShort),
      }}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onPrevious={previous}
      onNext={next}
    />
  );
}
