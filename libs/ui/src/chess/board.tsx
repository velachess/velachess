/**
 * The only place that knows `react-chessboard`'s `options` shape. No chess
 * rules: the board reports a gesture, the caller rules on it.
 */

import { Chessboard, defaultArrowOptions } from "react-chessboard";
import type { Arrow, SquareHandlerArgs } from "react-chessboard";
import { useState, type CSSProperties } from "react";

import { cn } from "../lib/utils.ts";
import {
  ANIMATION_DURATION_MS,
  ARROW_BEST,
  ARROW_SUGGESTED,
  BOARD_STYLE,
  HINT_STYLE,
  NOTATION_STYLE,
  badgeEdgesOf,
} from "./board-theme.ts";
import { SquareBadge } from "./square-badge.tsx";
import type { BadgeTone } from "./board-theme.ts";

/**
 * Only the head is trimmed: the library's eighth of a square plants it over
 * the destination piece, where a quarter clears the silhouette.
 */
const ARROW_GEOMETRY = {
  ...defaultArrowOptions,
  arrowLengthReducerDenominator: 4,
  // Under the library's 0.65, so the pieces an arrow crosses stay readable
  // and two crossing arrows do not stack into a third.
  opacity: 0.45,
} satisfies typeof defaultArrowOptions;

export type BoardSide = "white" | "black";

export interface BoardMove {
  from: string;
  to: string;
}

/** Declared here rather than imported: legality is the caller's. */
export interface BoardDestination {
  square: string;
  isCapture: boolean;
}

/**
 * Shaped like `BoardMove` but apart from it: this travels in as something
 * to show, a move travels out as something to rule on.
 */
export interface BoardArrow {
  from: string;
  to: string;
}

export interface BoardProps {
  fen: string;
  /** Which side sits at the bottom. */
  orientation?: BoardSide;
  /** True accepts the move, false snaps the piece back, and absent makes
   * the board read-only. */
  onMove?: ((move: BoardMove) => boolean) | undefined;
  lastMove?: BoardArrow | null | undefined;
  bestMove?: BoardArrow | null | undefined;
  /** Drawn apart from the grade colours: it answers a question rather than
   * judging what was played. */
  suggestedMove?: BoardArrow | null | undefined;
  /** Marks keyed by square. */
  badges?: Readonly<Record<string, BadgeTone>> | undefined;
  /**
   * Asked of the caller because whether a move captures is a rule question
   * en passant makes it, not an "is the square occupied" one. Absent means
   * no hints.
   */
  legalTargetsOf?: ((square: string) => readonly BoardDestination[]) | undefined;
  /** Off while stepping a replay, where the next keypress arrives before
   * any easing curve finishes and a queued animation reads as lag. */
  animated?: boolean;
  className?: string;
}

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

function squaresOf(move: BoardArrow | null | undefined): Record<string, CSSProperties> {
  if (!move) return {};
  return { [move.from]: BOARD_STYLE.highlight, [move.to]: BOARD_STYLE.highlight };
}

function withArrows(
  bestMove: BoardArrow | null | undefined,
  suggestedMove: BoardArrow | null | undefined,
): { arrows?: Arrow[] } {
  const drawn: Arrow[] = [];
  if (suggestedMove) {
    drawn.push({
      startSquare: suggestedMove.from,
      endSquare: suggestedMove.to,
      color: ARROW_SUGGESTED,
    });
  }
  if (bestMove) {
    drawn.push({ startSquare: bestMove.from, endSquare: bestMove.to, color: ARROW_BEST });
  }
  // No key rather than an empty array: the library treats "no arrows" as
  // absence.
  return drawn.length > 0 ? { arrows: drawn } : {};
}

export function Board({
  fen,
  orientation = "white",
  onMove,
  lastMove,
  bestMove,
  suggestedMove,
  badges,
  legalTargetsOf,
  animated = true,
  className,
}: BoardProps) {
  // Scoped to the position it was made in, so stepping leaves no dots.
  const [picked, setPicked] = useState<{ fen: string; square: string } | null>(null);
  const selected = picked?.fen === fen ? picked.square : null;
  const hints = hintsOf(selected, legalTargetsOf);
  const highlights = squaresOf(lastMove);

  /** Goes through `onMove` like a drop, so legality is decided once. */
  function selectOrMove({ piece, square }: SquareHandlerArgs): void {
    const reachable = selected
      ? legalTargetsOf?.(selected)?.some((target) => target.square === square)
      : false;

    if (selected && reachable) {
      onMove?.({ from: selected, to: square });
      setPicked(null);
      return;
    }
    setPicked(piece ? { fen, square } : null);
  }

  return (
    // The grid is `aspect-ratio: 1` squares, so the board is square
    // whatever this says.
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
          allowDragging: onMove !== undefined,
          lightSquareStyle: BOARD_STYLE.light,
          darkSquareStyle: BOARD_STYLE.dark,
          onPieceDrag: ({ square }) => setPicked(square ? { fen, square } : null),
          // `onSquareClick` alone fires for every square and carries the
          // piece; wiring `onPieceClick` too made one click on a capture
          // call `onMove` twice.
          onSquareClick: ({ piece, square }) => selectOrMove({ piece, square }),
          onPieceDragCancel: () => setPicked(null),
          showNotation: true,
          lightSquareNotationStyle: NOTATION_STYLE.onLight,
          darkSquareNotationStyle: NOTATION_STYLE.onDark,
          // Spread because `ChessboardOptions` wants the key absent, which
          // `exactOptionalPropertyTypes` tells from undefined.
          ...withArrows(bestMove, suggestedMove),
          arrowOptions: ARROW_GEOMETRY,
          // Without clearing the library's right-drag arrows on a position
          // change, a mark drawn on move 12 hangs on move 13.
          allowDrawingArrows: true,
          clearArrowsOnPositionChange: true,
          // Every square fill goes here, not `squareStyles`: the library
          // reads that only on the div a renderer replaces, and badges mean
          // there is always a renderer.
          squareRenderer: ({ square, children }) => {
            const tone = badges?.[square];
            return (
              <div
                className="relative flex h-full w-full items-center justify-center"
                style={{ ...highlights[square], ...hints[square] }}
              >
                {children}
                {tone !== undefined && (
                  <SquareBadge tone={tone} edges={badgeEdgesOf(square, orientation)} />
                )}
              </div>
            );
          },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            setPicked(null);
            if (!targetSquare) return false;
            return onMove?.({ from: sourceSquare, to: targetSquare }) ?? false;
          },
        }}
      />
    </div>
  );
}

// probe
