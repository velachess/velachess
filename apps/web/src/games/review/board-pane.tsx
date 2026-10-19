import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Board } from "@velachess/ui/chess/board";
import type { BoardMove } from "@velachess/ui/chess/board";
import type { BadgeTone } from "@velachess/ui/chess/board-theme";
import {
  BOARD_STAGE_WIDTH,
  BoardColumn,
  BoardStatus,
} from "@velachess/ui/chess/board-stage";
import { EvalBar } from "@velachess/ui/chess/eval-bar";
import { PlayerStrip } from "@velachess/ui/chess/player-strip";
import { cn } from "@velachess/ui/lib/utils";
import type { LegalDestination, MoveSquares } from "@velachess/chess";
import { squaresOfUci } from "@velachess/chess";

import {
  moveNumberOf,
  sideOfPly,
  whiteShareOf,
  type GradedPly,
  type MoveCategory,
} from "../analysis/index.ts";
import { squaresOfSanAt } from "./board-view.ts";
import type { ReplayMove } from "./game-record.ts";
import { badgeForCategory, formatBarScore } from "./move-presentation.ts";

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
  /** Provider identity of a tracked handle; absent for everyone else. */
  avatarUrl: string | undefined;
  flair: string | undefined;
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
  /** Accepts a drop/click move attempt; returns whether it was legal —
   * absent means the board stays read-only, same as passing nothing. */
  onMove: ((move: BoardMove) => boolean) | undefined;
  /** Legal destinations from the square on screen, for the drag hints —
   * absent means no hints drawn. */
  legalTargetsOf: ((square: string) => readonly LegalDestination[]) | undefined;
  /** Set while a user-tried alternate move is showing instead of the real
   * position — suppresses the best-move arrow and swaps the badge/banner
   * to its verdict instead of the real grade's. */
  exploringMove: MoveSquares | undefined;
  /** The exploring move's verdict, once the engine has answered — absent
   * while still evaluating. Only used for the square badge's color; the
   * banner itself stays generic. */
  exploringCategory: MoveCategory | undefined;
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
  onMove,
  legalTargetsOf,
  exploringMove,
  exploringCategory,
  top,
  bottom,
}: BoardPaneProps) {
  const { i18n } = useLingui();

  const exploring = exploringMove !== undefined;
  const showing = showingLabel(move, i18n._(BOARD_COPY.start));
  const lastMove = lastMoveOf(move, exploringMove);
  const bestMove = bestMoveOf(positionGrade, exploringMove);
  const evaluation = evaluationOf(playedGrade);
  const badges = exploring
    ? badgesFor(exploringMove.to, exploringCategory)
    : badgesFor(lastMove?.to, playedGrade?.category);

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
          whiteShare={evaluation.whiteShare}
          label={evaluation.label}
          description={i18n._(BOARD_COPY.evaluation)}
          orientation={orientation}
        />
        {/* Width only — the square belongs to `Board`. */}
        <Board
          fen={fen}
          orientation={orientation}
          // Off while stepping: the next keypress lands before any easing
          // curve finishes, and a queued animation reads as lag.
          animated={false}
          lastMove={lastMove}
          bestMove={bestMove}
          suggestedMove={exploring ? undefined : suggestedMove}
          badges={badges}
          onMove={onMove}
          legalTargetsOf={legalTargetsOf}
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

      <BoardStatus>{showing}</BoardStatus>
    </BoardColumn>
  );
}

function showingLabel(move: ReplayMove | undefined, start: string): string {
  if (!move) return start;

  const suffix = sideOfPly(move.ply) === "white" ? "." : "…";
  return `${moveNumberOf(move.ply)}${suffix} ${move.san}`;
}

function lastMoveOf(
  move: ReplayMove | undefined,
  exploringMove: MoveSquares | undefined,
): MoveSquares | undefined {
  if (exploringMove) return exploringMove;
  if (!move) return undefined;
  return squaresOfSanAt(move.fenBefore, move.san) ?? undefined;
}

function bestMoveOf(
  grade: GradedPly | undefined,
  exploringMove: MoveSquares | undefined,
): MoveSquares | undefined {
  // Suppressed while exploring: an alternate move's arrow showing the
  // real game's best move would compare against a position that is no
  // longer on screen.
  if (exploringMove || !grade) return undefined;
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
  category: MoveCategory | undefined,
): Record<string, BadgeTone> | undefined {
  if (!square || !category) return undefined;
  const tone = badgeForCategory(category);
  if (!tone) return undefined;
  return { [square]: tone };
}
