import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Board } from "@velachess/ui/chess/board";
import {
  BOARD_STAGE_WIDTH,
  BoardColumn,
  BoardStatus,
} from "@velachess/ui/chess/board-stage";
import { EvalBar } from "@velachess/ui/chess/eval-bar";
import { PlayerStrip } from "@velachess/ui/chess/player-strip";
import { cn } from "@velachess/ui/lib/utils";

import type { GradedPly } from "../analysis/index.ts";
import type { PlayerSeat } from "./review-presentation.ts";
import { useBoardReview } from "./use-board-review.ts";

const BOARD_COPY = {
  /** A landmark's name is read aloud, so it is copy like any other. */
  region: msg`Board`,
  evaluation: msg`Evaluation`,
} as const;

export interface BoardPaneProps {
  /** Grades in ply order — shorter than the game while the run streams. */
  graded: readonly GradedPly[];
  orientation: "white" | "black";
  /** The seat you are not is on top. */
  top: PlayerSeat;
  bottom: PlayerSeat;
}

/** The strips align with the board, so they take the board's width — the
 * shared one, which every board screen in the app is sized by. */
const BOARD_WIDTH = BOARD_STAGE_WIDTH;

/** The strips sit beside the bar, so they start where the board starts. */
const STRIP_INSET = "ps-6";

export function BoardPane({ graded, orientation, top, bottom }: BoardPaneProps) {
  const { i18n } = useLingui();
  const board = useBoardReview(graded);

  return (
    <BoardColumn label={i18n._(BOARD_COPY.region)}>
      <PlayerStrip
        name={top.name}
        rating={top.rating}
        avatarSrc={top.avatarUrl}
        flairSrc={top.flair}
        className={cn(STRIP_INSET, BOARD_WIDTH)}
      />

      <div className={cn("flex items-stretch gap-2", BOARD_WIDTH)}>
        <EvalBar
          whiteShare={board.evaluation.whiteShare}
          label={board.evaluation.label}
          description={i18n._(BOARD_COPY.evaluation)}
          orientation={orientation}
        />
        {/* Width only — the square belongs to `Board`. */}
        <Board
          fen={board.fen}
          orientation={orientation}
          // Off while stepping: the next keypress lands before any easing
          // curve finishes, and a queued animation reads as lag.
          animated={false}
          lastMove={board.lastMove}
          bestMove={board.bestMove}
          suggestedMove={board.suggestedMove}
          badges={board.badges}
          onMove={({ from, to }) => board.playMove(from, to)}
          legalTargetsOf={board.legalTargetsOf}
          className="max-w-none flex-1"
        />
      </div>

      <PlayerStrip
        name={bottom.name}
        rating={bottom.rating}
        avatarSrc={bottom.avatarUrl}
        flairSrc={bottom.flair}
        className={cn(STRIP_INSET, BOARD_WIDTH)}
      />

      <BoardStatus>{board.showing}</BoardStatus>
    </BoardColumn>
  );
}
