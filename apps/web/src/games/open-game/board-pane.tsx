import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Board } from "@velachess/ui/chess/board";
import type { SquareBadgeSpec } from "@velachess/ui/chess/board";
import {
  BOARD_STAGE_WIDTH,
  BoardColumn,
  BoardStatus,
} from "@velachess/ui/chess/board-stage";
import { EvalBar } from "@velachess/ui/chess/eval-bar";
import { PlayerStrip } from "@velachess/ui/chess/player-strip";
import { cn } from "@velachess/ui/lib/utils";
import type { MoveSquares } from "@velachess/chess";
import { squaresOfUci } from "@velachess/chess";

import {
  badgeForCategory,
  formatBarScore,
  moveNumberOf,
  sideOfPly,
  squaresOfSanAt,
  whiteShareOf,
} from "../analysis-read.ts";
import type { GradedPly, ReplayMove } from "../analysis-contract.ts";

const BOARD_COPY = {
  /** A landmark's name is read aloud, so it is copy like any other. */
  region: msg`Board`,
  start: msg`Starting position`,
  evaluation: msg`Evaluation`,
} as const;

/** An even position, for before the engine has said anything. */
const EVEN_SHARE = 0.5;
const EVEN_LABEL = "0.0";

interface PlayerSeat {
  name: string;
  /** Already localised — absent when the platform did not report one. */
  rating: string | undefined;
}

export interface BoardPaneProps {
  fen: string;
  orientation: "white" | "black";
  /** The move the board is showing; absent at the starting position. */
  move: ReplayMove | undefined;
  /** The engine's verdict on `move`, once it has reached that ply. */
  playedGrade: GradedPly | undefined;
  /** The verdict on the position now on the board — its `bestMove` is
   * the choice facing the player here, which is what the arrow draws. */
  positionGrade: GradedPly | undefined;
  /** A move someone asked to see, drawn apart from the grade colours. */
  suggestedMove: MoveSquares | undefined;
  /** The seat you are not is on top. */
  top: PlayerSeat;
  bottom: PlayerSeat;
}

/** The strips align with the board, so they take the board's width — the
 * shared one, which every board screen in the app is sized by. */
const BOARD_WIDTH = BOARD_STAGE_WIDTH;

/** The strips sit beside the bar, so they start where the board starts. */
const STRIP_INSET = "ps-6";

export function BoardPane({
  fen,
  orientation,
  move,
  playedGrade,
  positionGrade,
  suggestedMove,
  top,
  bottom,
}: BoardPaneProps) {
  const { i18n } = useLingui();

  const showing = showingLabel(move, i18n._(BOARD_COPY.start));
  const lastMove = lastMoveOf(move);
  const bestMove = bestMoveOf(positionGrade);
  const evaluation = evaluationOf(playedGrade);

  const badges = badgesFor(lastMove?.to, playedGrade);

  return (
    <BoardColumn label={i18n._(BOARD_COPY.region)}>
      <PlayerStrip
        name={top.name}
        rating={top.rating}
        className={cn(STRIP_INSET, BOARD_WIDTH)}
      />

      <div className={cn("flex items-stretch gap-2", BOARD_WIDTH)}>
        <EvalBar
          whiteShare={evaluation.whiteShare}
          label={evaluation.label}
          description={i18n._(BOARD_COPY.evaluation)}
          orientation={orientation}
        />
        {/* Width only — the square belongs to `Board`. */}
        <Board
          fen={fen}
          orientation={orientation}
          interactive={false}
          // Off while stepping: the next keypress lands before any easing
          // curve finishes, and a queued animation reads as lag.
          animated={false}
          lastMove={lastMove}
          bestMove={bestMove}
          suggestedMove={suggestedMove}
          badges={badges}
          className="max-w-none flex-1"
        />
      </div>

      <PlayerStrip
        name={bottom.name}
        rating={bottom.rating}
        className={cn(STRIP_INSET, BOARD_WIDTH)}
      />

      <BoardStatus>{showing}</BoardStatus>
    </BoardColumn>
  );
}

function showingLabel(move: ReplayMove | undefined, start: string): string {
  if (!move) return start;

  const suffix = sideOfPly(move.ply) === "white" ? "." : "…";
  return `${moveNumberOf(move.ply)}${suffix} ${move.san}`;
}

function lastMoveOf(move: ReplayMove | undefined): MoveSquares | undefined {
  if (!move) return undefined;
  return squaresOfSanAt(move.fenBefore, move.san) ?? undefined;
}

function bestMoveOf(grade: GradedPly | undefined): MoveSquares | undefined {
  if (!grade) return undefined;
  return squaresOfUci(grade.bestMove) ?? undefined;
}

function evaluationOf(grade: GradedPly | undefined) {
  if (!grade) return { whiteShare: EVEN_SHARE, label: EVEN_LABEL };

  return {
    whiteShare: whiteShareOf(grade.evalAfter),
    label: formatBarScore(grade.evalAfter),
  };
}

function badgesFor(
  square: string | undefined,
  grade: GradedPly | undefined,
): Record<string, SquareBadgeSpec> | undefined {
  if (!square || !grade) return undefined;
  const badge = badgeForCategory(grade.category);
  return badge ? { [square]: badge } : undefined;
}
