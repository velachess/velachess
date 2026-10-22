/**
 * [UI] The board primitive — the only place that knows `react-chessboard`'s
 * `options` shape, so an upstream change costs one file.
 *
 * The rule for this file: if `ChessboardOptions` already does it, we
 * configure it. Notation, animation, orientation, arrows and the square
 * slot are all the library's own; hand-rolling any of them means two
 * layouts competing over the same grid.
 *
 * No chess rules here: the board reports a gesture, the caller decides
 * whether the move was legal.
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
 * Arrow geometry, so an arrow annotates the move without burying the
 * piece it lands on.
 *
 * The tail stays at the centre of the origin square, overlapping the
 * piece being moved: that overlap is what reads as "this piece goes
 * there". Pulling it back to the square's edge, as `arrowStartOffset`
 * does, leaves the arrow floating free of the piece it belongs to.
 *
 * The head is the only end worth trimming. The library's default stops
 * an eighth of a square short, which plants it over the destination
 * piece; a quarter back clears the silhouette and still lands the head
 * well inside the square.
 */
const ARROW_GEOMETRY = {
  ...defaultArrowOptions,
  arrowLengthReducerDenominator: 4,
  // Well under the library's 0.65. An arrow is an annotation laid over
  // the position, so the pieces it crosses have to stay readable through
  // it, and two arrows that cross should not stack into a darker third.
  opacity: 0.45,
} satisfies typeof defaultArrowOptions;

export type BoardSide = "white" | "black";

export interface BoardMove {
  from: string;
  to: string;
}

/**
 * A square the caller says a piece may reach, and whether landing there
 * takes a piece — the board draws the two differently.
 *
 * Declared here rather than imported: legality is the caller's, and this
 * package knows nothing of chess rules or of `@velachess/chess`.
 */
export interface BoardDestination {
  square: string;
  isCapture: boolean;
}

/**
 * Two squares to draw between — a highlight or an arrow, depending on
 * which prop carries it. Shaped like `BoardMove` and kept apart from it
 * on purpose: this one travels in, as something to show, and a move
 * travels out, as something the caller has to rule on.
 */
export interface BoardArrow {
  from: string;
  to: string;
}

export interface BoardProps {
  fen: string;
  /** Which side sits at the bottom. Defaults to white. */
  orientation?: BoardSide;
  /**
   * Called when the user drops or clicks a piece onto a square. Return
   * true if the move was accepted — false makes the piece snap back.
   * Absent means the board is read-only.
   */
  onMove?: ((move: BoardMove) => boolean) | undefined;
  /** The move that produced this position: both squares get lit. */
  lastMove?: BoardArrow | undefined;
  /** The engine's first choice, drawn at full strength. */
  bestMove?: BoardArrow | undefined;
  /**
   * A move someone asked to see. Drawn apart from the grade colours,
   * because it answers a question rather than judging what was played.
   */
  suggestedMove?: BoardArrow | undefined;
  /** Marks keyed by square — a grade, or the book. */
  badges?: Readonly<Record<string, BadgeTone>> | undefined;
  /**
   * Legal destinations from a square, already classified by whether they
   * capture. Absent means no hints — a replay board is being read, not
   * played, and marks on it would be noise.
   *
   * Asked of the caller rather than computed here: legality belongs to
   * chessops, and this component knows only about squares. Including
   * whether a move captures, which en passant makes a rule question and
   * not a "is the square occupied" one.
   */
  legalTargetsOf?: ((square: string) => readonly BoardDestination[]) | undefined;
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
  suggestedMove: BoardArrow | undefined,
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
  suggestedMove,
  badges,
  legalTargetsOf,
  animated = true,
  className,
}: BoardProps) {
  // Scoped to the position it was made in: stepping to the next ply must
  // not leave dots on a square nobody picked up there.
  const [picked, setPicked] = useState<{ fen: string; square: string } | null>(null);
  const selected = picked?.fen === fen ? picked.square : null;
  const hints = hintsOf(selected, legalTargetsOf);
  const highlights = squaresOf(lastMove);

  /**
   * Click to move: pick a piece, then click where it goes. The second
   * half of the same gesture drag already covers, and the only one a
   * touch screen offers comfortably. It goes through `onMove` like a drop
   * does, so legality is still decided once, by the caller.
   */
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
          allowDragging: onMove !== undefined,
          lightSquareStyle: BOARD_STYLE.light,
          darkSquareStyle: BOARD_STYLE.dark,
          onPieceDrag: ({ square }) => setPicked(square ? { fen, square } : null),
          // `onSquareClick` alone: it fires for every square, occupied or
          // not, and carries the piece. A piece renders inside its square
          // and neither handler stops propagation, so also wiring
          // `onPieceClick` made one click on a capture call `onMove` twice.
          onSquareClick: ({ piece, square }) => selectOrMove({ piece, square }),
          onPieceDragCancel: () => setPicked(null),
          showNotation: true,
          lightSquareNotationStyle: NOTATION_STYLE.onLight,
          darkSquareNotationStyle: NOTATION_STYLE.onDark,
          // Spread rather than assigned: `exactOptionalPropertyTypes` makes
          // an explicit `undefined` a different thing from an absent key,
          // and `ChessboardOptions` asks for the key to be absent.
          ...withArrows(bestMove, suggestedMove),
          arrowOptions: ARROW_GEOMETRY,
          // Right-drag arrows are the library's, and free. Clearing them
          // on a position change matters here: without it a mark drawn
          // on move 12 is still hanging there on move 13.
          allowDrawingArrows: true,
          clearArrowsOnPositionChange: true,
          // Every square fill goes here, never through `squareStyles`:
          // the library reads that option only on the div a renderer
          // replaces — `squareRenderer?.(…) || <div style={{…squareStyles[id]}} />`
          // — and badges mean there is always a renderer. The hint wins
          // the overlap, so a piece picked up off the last move looks it.
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
            // A piece let go outside the board is never a move, so the
            // caller is never asked about one.
            if (!targetSquare) return false;
            return onMove?.({ from: sourceSquare, to: targetSquare }) ?? false;
          },
        }}
      />
    </div>
  );
}
