import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { MoveNav } from "@velachess/ui/chess/move-nav";

import type { ChessReplay } from "./use-chess-replay.ts";

const CONTROLS_COPY = {
  previous: msg`Previous move`,
  next: msg`Next move`,
  navigation: msg`Move navigation`,
  previousShort: msg`Prev`,
  nextShort: msg`Next`,
} as const;

export interface ReplayControlsProps {
  replay: ChessReplay;
}

/**
 * Stepping a game, in the shared vocabulary.
 *
 * The buttons themselves are `MoveNav` — the same ones Repertoire Study
 * uses — so this file is only the translation from a replay to that
 * component's plain callbacks, plus this screen's words for them. No
 * reset: the scoresheet already reaches every ply in one click.
 *
 * `sticky bottom-0`: on mobile the panel above this scrolls the page, so
 * without it Prev/Next would sit below a long game's eval graph, tabs and
 * result — pinning keeps it reachable just above the bottom tab bar.
 * `bg-card` covers the content that scrolls underneath once pinned. It's
 * a no-op at `lg`, where the panel bounds its own scroll and this already
 * sits at its natural position.
 */
export function ReplayControls({ replay }: ReplayControlsProps) {
  const { i18n } = useLingui();

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
      canGoBack={replay.canGoBack}
      canGoForward={replay.canGoForward}
      onPrevious={replay.previous}
      onNext={replay.next}
    />
  );
}
