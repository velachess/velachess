/**
 * Everything the board needs, already decided. Granular on both sides:
 * the report is read through a `select` naming the two grades the board
 * draws, so it re-renders when it looks different and not because the
 * analysis reached some other move.
 */
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { squaresOfUci, type LegalDestination, type MoveSquares } from "@velachess/chess";
import type { BadgeTone } from "@velachess/ui/chess/board-theme";

import { useQuery } from "../../libs/react-query.ts";
import { boardGradesAtPly, gameAnalysisQuery } from "./game-analysis-query.ts";
import { legalTargetsAt } from "./board-view.ts";
import type { ReplayableGame } from "./game-record.ts";
import { badgeAt, showingLabel } from "./move-presentation.ts";
import {
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
  badges: Record<string, BadgeTone> | undefined;
  bestMove: MoveSquares | undefined;
  suggestedMove: MoveSquares | undefined;
  /** What the board is showing, in words, for the live region. */
  showing: string;
}

export function useBoardReview(game: ReplayableGame): BoardReview {
  const { i18n } = useLingui();

  const fen = useGameReview((state) => selectFen(state, game));
  const ply = useGameReview((state) => state.ply);
  const inVariation = useGameReview((state) => state.variation !== null);
  const variationMove = useGameReview(selectVariationMove);
  const gameMove = useGameReview((state) => selectGameMove(state, game));
  const showingSan = useGameReview((state) => selectShowingSan(state, game));
  const showBestMove = useGameReview((state) => state.showBestMove);
  const playMove = useGameReview((state) => state.playMove);

  const grades = useQuery({
    ...gameAnalysisQuery(game),
    select: boardGradesAtPly(ply),
  });
  const playedGrade = grades.data?.played;
  const positionGrade = grades.data?.position;
  const lastMove = variationMove ?? (gameMove ? squaresOfUci(gameMove.uci) : null);

  return {
    fen,
    playMove,
    legalTargetsOf: (square) => legalTargetsAt(fen, square),
    lastMove: lastMove ?? undefined,
    // Nothing of the report is drawn over a variation: it would be about
    // a position no longer on screen.
    badges: inVariation ? undefined : badgeAt(lastMove?.to, playedGrade?.category),
    bestMove:
      inVariation || !positionGrade?.bestMove
        ? undefined
        : (squaresOfUci(positionGrade.bestMove) ?? undefined),
    suggestedMove:
      inVariation || !showBestMove || !playedGrade?.bestMove
        ? undefined
        : (squaresOfUci(playedGrade.bestMove) ?? undefined),
    showing: showingLabel(showingSan, gameMove, inVariation, i18n._(BOARD_COPY.start)),
  };
}
