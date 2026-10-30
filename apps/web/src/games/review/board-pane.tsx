import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Board } from "@velachess/ui/chess/board";
import {
  BOARD_STAGE_WIDTH,
  BoardColumn,
  BoardStatus,
} from "@velachess/ui/chess/board-stage";
import { PlayerStrip } from "@velachess/ui/chess/player-strip";
import { cn } from "@velachess/ui/lib/utils";

import { BoardEvaluation } from "./board-evaluation.tsx";
import type { ReplayableGame } from "./game-record.ts";
import type { PlayerSeat } from "./review-presentation.ts";
import { useBoardReview } from "./use-board-review.ts";

const BOARD_COPY = {
  /** A landmark's name is read aloud, so it is copy like any other. */
  region: msg`Board`,
} as const;

export interface BoardPaneProps {
  game: ReplayableGame;
  orientation: "white" | "black";
  /** The seat you are not is on top. */
  top: PlayerSeat;
  bottom: PlayerSeat;
}

/** The strips align with the board, so they take its shared width. */
const BOARD_WIDTH = BOARD_STAGE_WIDTH;

/** Beside the bar, so a strip starts where the board starts. */
const STRIP_INSET = "ps-6";

export function BoardPane({ game, orientation, top, bottom }: BoardPaneProps) {
  const { i18n } = useLingui();
  const board = useBoardReview(game);

  return (
    <BoardColumn label={i18n._(BOARD_COPY.region)}>
      <PlayerStrip
        name={top.name}
        rating={top.rating}
        className={cn(STRIP_INSET, BOARD_WIDTH)}
      />

      <div className={cn("flex items-stretch gap-2", BOARD_WIDTH)}>
        <BoardEvaluation game={game} orientation={orientation} />
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
        className={cn(STRIP_INSET, BOARD_WIDTH)}
      />

      <BoardStatus>{board.showing}</BoardStatus>
    </BoardColumn>
  );
}
