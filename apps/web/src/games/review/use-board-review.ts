/**
 * Everything the board needs, already decided: `board-pane.tsx` reads
 * this and lays it out, rather than assembling it from the store.
 *
 * Granular selectors on purpose — `variation` and `variationEvaluation`
 * are replaced wholesale when they change, so a render happens when the
 * board actually looks different and not when some other part of the
 * review moved.
 */
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { squaresOfUci, type LegalDestination, type MoveSquares } from "@velachess/chess";
import type { BadgeTone } from "@velachess/ui/chess/board-theme";

import type { GradedPly } from "../analysis/index.ts";
import { legalTargetsAt, squaresOfSanAt, suggestedArrow } from "./board-view.ts";
import { badgeAt, evaluationOf, showingLabel } from "./move-presentation.ts";
import {
  gradeAtPly,
  selectFen,
  selectGameMove,
  selectShowingSan,
  selectVariationMove,
} from "./review-model.ts";
import { useGameReview } from "./use-game-review.ts";

const BOARD_COPY = {
  start: msg`Starting position`,
} as const;

export interface BoardReview {
  fen: string;
  /** False when the position does not allow the move — nothing changes. */
  playMove: (from: string, to: string) => boolean;
  legalTargetsOf: (square: string) => readonly LegalDestination[];
  lastMove: MoveSquares | undefined;
  evaluation: { whiteShare: number; label: string };
  badges: Record<string, BadgeTone> | undefined;
  bestMove: MoveSquares | undefined;
  suggestedMove: MoveSquares | undefined;
  /** What the board is showing, in words, for the live region. */
  showing: string;
}

export function useBoardReview(graded: readonly GradedPly[]): BoardReview {
  const { i18n } = useLingui();

  const fen = useGameReview(selectFen);
  const ply = useGameReview((state) => state.ply);
  const inVariation = useGameReview((state) => state.variation !== null);
  const variationMove = useGameReview(selectVariationMove);
  const variationScore = useGameReview((state) => state.variationEvaluation?.score);
  const gameMove = useGameReview(selectGameMove);
  const showingSan = useGameReview(selectShowingSan);
  const preview = useGameReview((state) => state.preview);
  const playMove = useGameReview((state) => state.playMove);

  // The move just played, and the choice facing whoever is to move now.
  const playedGrade = gradeAtPly(graded, ply);
  const positionGrade = gradeAtPly(graded, ply + 1);
  const lastMove =
    variationMove ?? (gameMove ? squaresOfSanAt(gameMove.fenBefore, gameMove.san) : null);

  return {
    fen,
    playMove,
    legalTargetsOf: (square) => legalTargetsAt(fen, square),
    lastMove: lastMove ?? undefined,
    evaluation: evaluationOf(variationScore ?? playedGrade?.evalAfter),
    // Nothing of the report is drawn over a variation: its badge, its
    // best move and a previewed arrow would all be about a position that
    // is no longer on screen.
    badges: inVariation ? undefined : badgeAt(lastMove?.to, playedGrade?.category),
    bestMove:
      inVariation || !positionGrade?.bestMove
        ? undefined
        : (squaresOfUci(positionGrade.bestMove) ?? undefined),
    suggestedMove: inVariation
      ? undefined
      : (suggestedArrow(gameMove?.fenBefore, preview) ?? undefined),
    showing: showingLabel(
      showingSan,
      gameMove?.fenBefore,
      inVariation,
      i18n._(BOARD_COPY.start),
    ),
  };
}
