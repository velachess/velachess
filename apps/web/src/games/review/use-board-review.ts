/**
 * Everything the board needs, already decided: `board-pane.tsx` reads
 * this and lays it out, rather than assembling it from the store.
 *
 * Granular on purpose, on both sides. `variation` and
 * `variationEvaluation` are replaced wholesale when they change, and the
 * report is read through a `select` that names the two grades the board
 * draws — so the board re-renders when it actually looks different, and
 * not because the analysis reached some other move or deepened its
 * search.
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

  // The move just played, and the choice facing whoever is to move now.
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
    // Nothing of the report is drawn over a variation: its badge, its
    // best move and a revealed arrow would all be about a position that
    // is no longer on screen.
    badges: inVariation ? undefined : badgeAt(lastMove?.to, playedGrade?.category),
    bestMove:
      inVariation || !positionGrade?.bestMove
        ? undefined
        : (squaresOfUci(positionGrade.bestMove) ?? undefined),
    // The engine's move at the position this one was played from, which
    // is what `playedGrade.bestMove` is — asked for, rather than drawn
    // over every move like `bestMove` above.
    suggestedMove:
      inVariation || !showBestMove || !playedGrade?.bestMove
        ? undefined
        : (squaresOfUci(playedGrade.bestMove) ?? undefined),
    showing: showingLabel(showingSan, gameMove, inVariation, i18n._(BOARD_COPY.start)),
  };
}
