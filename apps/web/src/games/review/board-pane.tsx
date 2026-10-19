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
import type { MoveSquares } from "@velachess/chess";
import { squaresOfUci } from "@velachess/chess";

import {
  gradeAtPly,
  moveNumberOf,
  sideOfPly,
  whiteShareOf,
  type GradedPly,
} from "../analysis/index.ts";
import { legalTargetsAt, squaresOfSanAt, suggestedArrow } from "./board-view.ts";
import {
  selectFen,
  selectLastMove,
  selectShowingSan,
  useGameReview,
} from "./use-game-review.ts";
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

  const fen = useGameReview(selectFen);
  const ply = useGameReview((state) => state.ply);
  const inVariation = useGameReview((state) => state.variation !== null);
  const variationScore = useGameReview((state) => state.variationEvaluation?.score);
  const preview = useGameReview((state) => state.preview);
  const variationMove = useGameReview(selectLastMove);
  const showingSan = useGameReview(selectShowingSan);
  const playMove = useGameReview((state) => state.playMove);
  const move = useGameReview((state) => state.moves[state.ply - 1]);

  // The move just played, and the choice facing whoever is to move now.
  const playedGrade = gradeAtPly(graded, ply);
  const positionGrade = gradeAtPly(graded, ply + 1);

  const showing = showingLabel(showingSan, ply, inVariation, i18n._(BOARD_COPY.start));
  const lastMove = variationMove ?? lastMoveOf(move);
  const evaluation = evaluationOf(variationScore ?? playedGrade?.evalAfter);
  const badges = inVariation ? undefined : badgesFor(lastMove?.to, playedGrade?.category);

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
          lastMove={lastMove ?? undefined}
          // Suppressed inside a variation: the real game's best move here
          // would be an arrow about a position that is no longer on screen.
          bestMove={inVariation ? undefined : bestMoveOf(positionGrade)}
          suggestedMove={
            inVariation
              ? undefined
              : (suggestedArrow(move?.fenBefore, preview) ?? undefined)
          }
          badges={badges}
          onMove={(boardMove: BoardMove) =>
            boardMove.to ? playMove(boardMove.from, boardMove.to) : false
          }
          legalTargetsOf={(square) => legalTargetsAt(fen, square)}
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

/**
 * A variation's moves have no number of their own — they all answer the
 * same ply — so the line's notation is announced on its own.
 */
function showingLabel(
  san: string | null,
  ply: number,
  inVariation: boolean,
  start: string,
): string {
  if (!san) return start;
  if (inVariation) return san;

  const suffix = sideOfPly(ply) === "white" ? "." : "…";
  return `${moveNumberOf(ply)}${suffix} ${san}`;
}

function lastMoveOf(move: { fenBefore: string; san: string } | undefined) {
  if (!move) return null;
  return squaresOfSanAt(move.fenBefore, move.san);
}

function bestMoveOf(grade: GradedPly | undefined): MoveSquares | undefined {
  if (!grade) return undefined;
  return squaresOfUci(grade.bestMove) ?? undefined;
}

function evaluationOf(score: GradedPly["evalAfter"] | undefined) {
  if (!score) return { whiteShare: EVEN_SHARE, label: EVEN_LABEL };

  return {
    whiteShare: whiteShareOf(score),
    label: formatBarScore(score),
  };
}

function badgesFor(
  square: string | undefined,
  category: GradedPly["category"] | undefined,
): Record<string, BadgeTone> | undefined {
  if (!square || !category) return undefined;
  const tone = badgeForCategory(category);
  if (!tone) return undefined;
  return { [square]: tone };
}
