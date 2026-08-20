/**
 * [UI] The board primitive — the only place that knows `react-chessboard`'s
 * `options` shape, so an upstream change costs one file.
 *
 * The rule for this file: if `ChessboardOptions` already does it, we
 * configure it. Notation, animation, square fills, arrows and the badge
 * slot are all the library's own; hand-rolling any of them means two
 * layouts competing over the same grid.
 *
 * No chess rules here: the board reports a drop, the caller decides
 * whether the move was legal.
 */

import { Chessboard } from "react-chessboard";
import type { Arrow } from "react-chessboard";
import { useState } from "react";
import type { LegalDestination } from "@velachess/chess";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "../lib/utils.ts";
import {
  ANIMATION_DURATION_MS,
  ARROW_BEST,
  ARROW_PLAYED,
  ARROW_SUGGESTED,
  BOARD_STYLE,
  HINT_STYLE,
  MAX_ARROWS,
  NOTATION_STYLE,
  arrowAlternativeColor,
} from "./board-theme.ts";
import { SquareBadge } from "./square-badge.tsx";
import type { BadgeTone } from "./board-theme.ts";

export type BoardSide = "white" | "black";

export interface BoardMove {
  from: string;
  /** null when a piece is dropped off the board. */
  to: string | null;
}

/** A line the engine offers, in squares rather than UCI. */
export interface BoardArrow {
  from: string;
  to: string;
}

export interface SquareBadgeSpec {
  tone: BadgeTone;
  /** Glyph or icon. Words come from the caller — this package cannot
   * translate, so it never invents any. */
  label: ReactNode;
}

export interface BoardProps {
  /** Position to render, in FEN. */
  fen: string;
  /** Which side sits at the bottom. Defaults to white. */
  orientation?: BoardSide;
  /**
   * Called when the user drops a piece. Return true if the move was
   * accepted — returning false makes the piece snap back.
   */
  onMove?: (move: BoardMove) => boolean;
  /** The move that produced this position: both squares get lit. */
  lastMove?: BoardArrow | undefined;
  /** The engine's first choice, drawn at full strength. */
  bestMove?: BoardArrow | undefined;
  /**
   * A move that was played and should not have been, drawn beside the
   * one that should have been. Two arrows say the whole verdict without
   * a sentence: this is what you did, that is what was there.
   */
  playedMove?: BoardArrow | undefined;
  /**
   * A move someone asked to see. Drawn apart from the grade colours,
   * because it answers a question rather than judging what was played.
   */
  suggestedMove?: BoardArrow | undefined;
  /** Runner-up lines, strongest first. Faded by rank so the first
   * choice stays the answer rather than one of three suggestions. */
  alternatives?: readonly BoardArrow[];
  /** Marks keyed by square — a grade, or the book. */
  badges?: Readonly<Record<string, SquareBadgeSpec>> | undefined;
  /**
   * Legal destinations from a square, already classified by whether they
   * capture. Absent means no hints — a replay board is being read, not
   * played, and marks on it would be noise, which is also how a harder
   * drill turns them off.
   *
   * Asked of the caller rather than computed here: legality belongs to
   * chessops, and this component knows only about squares. Including
   * whether a move captures, which en passant makes a rule question and
   * not a "is the square occupied" one.
   */
  legalTargetsOf?: (square: string) => readonly LegalDestination[];
  /**
   * Whether picking a piece up shows where it may go.
   *
   * `"selected"` marks the origin square, dots the quiet destinations and
   * rings the captures, once a piece is dragged or clicked. `"off"` shows
   * nothing — a replay board is read rather than played, and a harder
   * drill can withhold the help on purpose.
   *
   * Named rather than inferred from `legalTargetsOf` being present: a
   * screen that turns the hints off should not have to drop the function
   * that computes them.
   */
  showLegalMoves?: "off" | "selected";
  /** Read-only board (replay, chapter preview). */
  interactive?: boolean;
  /**
   * Animate piece movement. Off while stepping through a replay: the
   * next keypress arrives before any easing curve finishes, and a
   * queued animation reads as lag.
   */
  animated?: boolean;
  className?: string;
}

/**
 * Where a picked-up piece may go, keyed by square.
 *
 * The library has no idea what chess is — it renders squares and reports
 * drags. Legality is ours, so the caller answers `legalTargetsOf` and
 * this only paints. Capture and quiet move get different shapes because
 * they are different offers.
 */
function hintsOf(
  from: string | null,
  legalTargetsOf: BoardProps["legalTargetsOf"],
): Record<string, CSSProperties> {
  if (!from || !legalTargetsOf) return {};

  const styles: Record<string, CSSProperties> = { [from]: HINT_STYLE.selected };
  for (const to of legalTargetsOf(from)) {
    styles[to.square] = to.isCapture ? HINT_STYLE.capture : HINT_STYLE.move;
  }
  return styles;
}

function squaresOf(move: BoardArrow | undefined): Record<string, CSSProperties> {
  if (!move) return {};
  return { [move.from]: BOARD_STYLE.highlight, [move.to]: BOARD_STYLE.highlight };
}

function withArrows(
  bestMove: BoardArrow | undefined,
  alternatives: readonly BoardArrow[],
  playedMove?: BoardArrow | undefined,
  suggestedMove?: BoardArrow | undefined,
): { arrows?: Arrow[] } {
  const drawn: Arrow[] = [];
  if (suggestedMove) {
    drawn.push({
      startSquare: suggestedMove.from,
      endSquare: suggestedMove.to,
      color: ARROW_SUGGESTED,
    });
  }
  if (playedMove) {
    drawn.push({
      startSquare: playedMove.from,
      endSquare: playedMove.to,
      color: ARROW_PLAYED,
    });
  }
  if (bestMove) {
    drawn.push({
      startSquare: bestMove.from,
      endSquare: bestMove.to,
      color: ARROW_BEST,
    });
  }
  for (const [index, line] of alternatives.entries()) {
    if (drawn.length >= MAX_ARROWS) break;
    drawn.push({
      startSquare: line.from,
      endSquare: line.to,
      color: arrowAlternativeColor(index),
    });
  }
  // Nothing to draw means no key at all, not an empty array — the
  // library's own example treats "no arrows" as absence.
  return drawn.length > 0 ? { arrows: drawn } : {};
}

export function Board({
  fen,
  orientation = "white",
  onMove,
  lastMove,
  bestMove,
  playedMove,
  suggestedMove,
  alternatives = [],
  badges,
  legalTargetsOf,
  showLegalMoves = "selected",
  interactive = true,
  animated = true,
  className,
}: BoardProps) {
  // Which piece is in the air (or clicked), so the dots know their origin.
  // Kept here rather than in every screen: picking a piece up is the
  // board's own gesture, and a caller that had to track it would be
  // re-implementing the board.
  const [selected, setSelected] = useState<string | null>(null);
  const hints = hintsOf(showLegalMoves === "off" ? null : selected, legalTargetsOf);

  /**
   * Click to move: pick a piece, then click where it goes.
   *
   * The second half of the same gesture drag already covers, and the only
   * one a touch screen offers comfortably. It goes through `onMove` like
   * a drop does, so legality is still decided once, by the caller.
   *
   * A click on another piece re-selects rather than trying to move onto
   * it — unless taking it is legal, which is what the destination check
   * answers first.
   */
  function selectOrMove({
    piece,
    square,
  }: {
    piece: unknown;
    // The library reports a null square for a drop off the board.
    square: string | null;
  }): void {
    if (!square) {
      setSelected(null);
      return;
    }

    const reachable = selected
      ? legalTargetsOf?.(selected)?.some((target) => target.square === square)
      : false;

    if (selected && reachable) {
      onMove?.({ from: selected, to: square });
      setSelected(null);
      return;
    }
    setSelected(piece ? square : null);
  }

  return (
    // The board is a grid of `aspect-ratio: 1` squares, so it is square
    // whatever this says. `aspect-square` states that out loud — every
    // height supplied from outside has been wrong so far.
    <div
      data-slot="board"
      className={cn("aspect-square w-full max-w-xl rounded-lg", className)}
    >
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          showAnimations: animated,
          animationDurationInMs: ANIMATION_DURATION_MS,
          allowDragging: interactive && onMove !== undefined,
          lightSquareStyle: BOARD_STYLE.light,
          darkSquareStyle: BOARD_STYLE.dark,
          // The last move still goes here: it is painted before any
          // renderer runs, and the library merges it into the square's own
          // background rather than the child this component returns.
          squareStyles: squaresOf(lastMove),
          // Three gestures reach the same selection, because all three
          // are how people pick a piece: dragging it, clicking it, and
          // clicking a square that happens to hold one. Wiring only the
          // drag left the dots invisible to anyone who taps.
          onPieceDrag: ({ square }) => setSelected(square),
          // Both reach the same handler: `onPieceClick` fires for a square
          // that holds a piece, `onSquareClick` for one that does not, and
          // moving needs the empty ones too.
          onPieceClick: ({ piece, square }) => selectOrMove({ piece, square }),
          onSquareClick: ({ piece, square }) => selectOrMove({ piece, square }),
          onPieceDragCancel: () => setSelected(null),
          showNotation: true,
          lightSquareNotationStyle: NOTATION_STYLE.onLight,
          darkSquareNotationStyle: NOTATION_STYLE.onDark,
          // Spread rather than assigned: `exactOptionalPropertyTypes` makes
          // an explicit `undefined` a different thing from an absent key,
          // and `ChessboardOptions` asks for the key to be absent.
          ...withArrows(bestMove, alternatives, playedMove, suggestedMove),
          // Right-drag arrows are the library's, and free. Clearing them
          // on a position change matters here: without it a mark drawn
          // on move 12 is still hanging there on move 13.
          allowDrawingArrows: true,
          clearArrowsOnPositionChange: true,
          // `squareStyles` is only read by the library's own square div,
          // and a `squareRenderer` replaces it outright — the source is
          // `squareRenderer?.(…) || <div style={{…squareStyles[id]}} />`.
          // Since we render badges, nothing was ever consuming the hints,
          // so they have to be applied here by hand.
          squareRenderer: ({ square, children }) => {
            const badge = badges?.[square];
            return (
              <div
                className="relative flex h-full w-full items-center justify-center"
                style={hints[square]}
              >
                {children}
                {badge !== undefined && (
                  <SquareBadge tone={badge.tone}>{badge.label}</SquareBadge>
                )}
              </div>
            );
          },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            setSelected(null);
            return onMove?.({ from: sourceSquare, to: targetSquare }) ?? false;
          },
        }}
      />
    </div>
  );
}
