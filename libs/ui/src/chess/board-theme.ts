/**
 * [UI] Style values for react-chessboard, which takes CSSProperties (not
 * classNames) for squares/notation/frame. Values come from CSS custom
 * properties in `styles/theme.css` — no literal colours here.
 */

import { chessColumnToColumnIndex, chessRowToRowIndex } from "react-chessboard";
import type { CSSProperties } from "react";

/** Custom properties this module reads. Declared in `styles/theme.css`. */
const TOKEN = {
  lightSquare: "--board-light",
  darkSquare: "--board-dark",
  highlight: "--board-highlight",
  suggested: "--board-suggested",
  gradeOk: "--move-ok",
  gradeInaccuracy: "--move-inaccuracy",
  gradeMistake: "--move-mistake",
  gradeBlunder: "--move-blunder",
  notationOnLight: "--board-dark",
  notationOnDark: "--board-light",
} as const;

function cssVar(name: (typeof TOKEN)[keyof typeof TOKEN]): string {
  return `var(${name})`;
}

/**
 * Badge tones — not chess move categories. Four grade colours plus "book",
 * matching `styles/theme.css`; callers map their own vocabulary onto these.
 */
export const BADGE_TONES = ["ok", "inaccuracy", "mistake", "blunder", "book"] as const;

export type BadgeTone = (typeof BADGE_TONES)[number];

export const BADGE_TONE_COLOR: Record<BadgeTone, string> = {
  ok: cssVar(TOKEN.gradeOk),
  inaccuracy: cssVar(TOKEN.gradeInaccuracy),
  mistake: cssVar(TOKEN.gradeMistake),
  blunder: cssVar(TOKEN.gradeBlunder),
  book: cssVar(TOKEN.highlight),
};

/**
 * Where on a square a badge sits.
 *
 * Listed best-first: the order is the tie-break, so two corners that are
 * equally clear always resolve the same way and the badge never
 * oscillates between them across renders.
 */
export const BADGE_CORNERS = [
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
] as const;

export type BadgeCorner = (typeof BADGE_CORNERS)[number];

/** A move an arrow is drawn for, in the only terms this needs. */
export interface ArrowSquares {
  from: string;
  to: string;
}

type Vector = { x: number; y: number };

/** Each corner as a unit-ish direction from the square's centre, on screen. */
const CORNER_DIRECTION: Record<BadgeCorner, Vector> = {
  "top-right": { x: 1, y: -1 },
  "top-left": { x: -1, y: -1 },
  "bottom-right": { x: 1, y: 1 },
  "bottom-left": { x: -1, y: 1 },
};

/** A standard board. The library's helpers take these as arguments. */
const BOARD_SIZE = 8;
const LAST = BOARD_SIZE - 1;

/**
 * A square in screen cells, which is what a corner is about: flipping
 * the board moves the "top-right" corner to the other end of the
 * position.
 *
 * The conversion is react-chessboard's own, orientation included —
 * the same one it lays the squares out with, so a corner computed here
 * cannot drift from where the square is actually drawn.
 */
function screenCellOf(square: string, orientation: "white" | "black"): Vector | null {
  const file = square[0];
  const rank = square[1];
  if (file === undefined || rank === undefined || square.length !== 2) return null;

  const x = chessColumnToColumnIndex(file, BOARD_SIZE, orientation);
  const y = chessRowToRowIndex(rank, BOARD_SIZE, orientation);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < 0 || x > LAST || y < 0 || y > LAST) return null;

  return { x, y };
}

/** Whether a corner of this cell would hang off the board. */
function isOnBoardEdge(cell: Vector, corner: BadgeCorner): boolean {
  const { x, y } = CORNER_DIRECTION[corner];
  const atVerticalEdge = (x > 0 && cell.x === LAST) || (x < 0 && cell.x === 0);
  const atHorizontalEdge = (y > 0 && cell.y === LAST) || (y < 0 && cell.y === 0);
  return atVerticalEdge || atHorizontalEdge;
}

function normalise({ x, y }: Vector): Vector | null {
  const length = Math.hypot(x, y);
  return length === 0 ? null : { x: x / length, y: y / length };
}

/** Distance from a point to a line segment, all in board cells. */
function distanceToSegment(point: Vector, from: Vector, to: Vector): number {
  const run = { x: to.x - from.x, y: to.y - from.y };
  const lengthSquared = run.x * run.x + run.y * run.y;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);

  const along = ((point.x - from.x) * run.x + (point.y - from.y) * run.y) / lengthSquared;
  const clamped = Math.min(1, Math.max(0, along));
  return Math.hypot(
    point.x - (from.x + clamped * run.x),
    point.y - (from.y + clamped * run.y),
  );
}

/** How far from a corner an arrow still crowds it, in board cells. */
const PROXIMITY_REACH = 1;

/**
 * How badly one arrow spoils one corner.
 *
 * Two things put an arrow on a corner, and checking only one misses half
 * the collisions.
 *
 * An arrow that starts or ends on this square runs along a bearing and
 * plants its head at the centre, sweeping the whole half of the square
 * on that side. That is judged by direction, because every corner sits
 * the same distance from a line through the middle.
 *
 * An arrow that merely passes by never touches the square and can still
 * cross a corner exactly: the engine's Qh4# runs d8-h4, threading the
 * point where g4, g5, h4 and h5 meet — a corner of the very square the
 * played g4 was graded on. That one is judged by distance, since its
 * bearing says nothing about this square.
 */
function arrowPenaltyAt(
  corner: Vector,
  square: string,
  cell: Vector,
  orientation: "white" | "black",
  arrow: ArrowSquares,
): number {
  const from = screenCellOf(arrow.from, orientation);
  const to = screenCellOf(arrow.to, orientation);
  if (!from || !to) return 0;

  // Inside half a cell the arrow is drawn over the badge; past a full
  // cell it is irrelevant. The ramp between keeps the ordering stable
  // instead of flipping on a rounding error.
  const distance = distanceToSegment(corner, from, to);
  const proximity = Math.max(0, 1 - distance / PROXIMITY_REACH);

  const other = arrow.to === square ? from : arrow.from === square ? to : null;
  if (!other) return proximity;

  const heading = normalise({ x: other.x - cell.x, y: other.y - cell.y });
  const direction = normalise({ x: corner.x - cell.x, y: corner.y - cell.y });
  if (!heading || !direction) return proximity;

  // Only an arrow on this corner's side counts against it. One heading
  // the other way leaves the corner alone, and a signed sum would let
  // two opposed arrows cancel a collision that is really there.
  const alignment = Math.max(0, direction.x * heading.x + direction.y * heading.y);
  return proximity + alignment;
}

/**
 * The corner of `square` a badge should take.
 *
 * A badge used to live on the top-right corner always, which collides
 * with any arrow that reaches or crosses that corner — and the engine's
 * suggestion routinely lands on the square the played move was graded
 * on. Corners that would hang off the board are dropped first (a square
 * always keeps at least the one facing the board's middle), then the
 * least crowded of what is left wins.
 */
export function badgeCornerOf(
  square: string,
  orientation: "white" | "black",
  arrows: readonly ArrowSquares[] = [],
): BadgeCorner {
  const cell = screenCellOf(square, orientation);
  if (!cell) return BADGE_CORNERS[0];

  const candidates = BADGE_CORNERS.filter((corner) => !isOnBoardEdge(cell, corner));
  const usable = candidates.length > 0 ? candidates : BADGE_CORNERS;
  if (arrows.length === 0) return usable[0]!;

  let best = usable[0]!;
  let bestScore = Infinity;

  for (const corner of usable) {
    const offset = CORNER_DIRECTION[corner];
    // The corner itself: half a cell out from the square's centre.
    const point = { x: cell.x + offset.x / 2, y: cell.y + offset.y / 2 };
    const score = arrows.reduce(
      (total, arrow) => total + arrowPenaltyAt(point, square, cell, orientation, arrow),
      0,
    );
    // Strictly less keeps declaration order as the tie-break, so an
    // equally clear corner never steals the place from the preferred one.
    if (score < bestScore) {
      best = corner;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Arrow colours, as strings the library hands to SVG.
 *
 * `arrowOptions.opacity` is board-wide, so a per-arrow weight has to ride
 * inside the colour itself. `color-mix` against `transparent` is how a
 * custom property gets an alpha without being decomposed into channels.
 */
function withAlpha(color: string, percent: number): string {
  return `color-mix(in oklab, ${color} ${percent}%, transparent)`;
}

/** The engine's first choice: full strength, so it reads as the answer. */
export const ARROW_BEST = cssVar(TOKEN.gradeOk);

/**
 * The move that was played and should not have been.
 *
 * Drawn in the blunder tone rather than a colour of its own, so a wrong
 * move looks the same here as it does in the game report — one grade
 * vocabulary across both screens.
 */
export const ARROW_PLAYED = cssVar(TOKEN.gradeBlunder);

/**
 * A move someone asked to see, drawn apart from the grade ramp.
 *
 * Green already means "this was the best move" and red "this lost you
 * something". A suggestion is neither — it is an answer to a question,
 * and giving it a verdict colour would read as one.
 */
export const ARROW_SUGGESTED = cssVar(TOKEN.suggested);

/**
 * Alternative lines fade with their rank. Index 0 is the second line —
 * the best move is `ARROW_BEST` and never appears here.
 */
const ALTERNATIVE_ALPHA_PERCENT = [55, 32] as const;

export function arrowAlternativeColor(rankFromSecond: number): string {
  const alpha =
    ALTERNATIVE_ALPHA_PERCENT[rankFromSecond] ??
    ALTERNATIVE_ALPHA_PERCENT[ALTERNATIVE_ALPHA_PERCENT.length - 1]!;
  return withAlpha(cssVar(TOKEN.highlight), alpha);
}

/** How many lines we are willing to draw, best move included. */
export const MAX_ARROWS = ALTERNATIVE_ALPHA_PERCENT.length + 1;

export const BOARD_STYLE = {
  light: { backgroundColor: cssVar(TOKEN.lightSquare) },
  dark: { backgroundColor: cssVar(TOKEN.darkSquare) },
  highlight: { backgroundColor: cssVar(TOKEN.highlight) },
} as const satisfies Record<string, React.CSSProperties>;

/**
 * Notation needs two colours because it sits on two backgrounds — the
 * library asks for them separately for exactly that reason.
 */
export const NOTATION_STYLE = {
  onLight: { color: cssVar(TOKEN.notationOnLight) },
  onDark: { color: cssVar(TOKEN.notationOnDark) },
} as const satisfies Record<string, React.CSSProperties>;

/**
 * Long enough to read as a move, short enough not to gate the next one.
 * Stepping through a game with the arrow keys is faster than any easing
 * curve, so the replay turns animation off rather than queueing.
 */
export const ANIMATION_DURATION_MS = 180;

/**
 * Move-hint dots: filled dot for a quiet move, ring for a capture (the
 * Lichess/Chess.com convention). Painted via radial-gradient because
 * squareStyles only accepts CSS properties, not child nodes.
 */
const HINT_COLOR = "color-mix(in oklab, var(--foreground) 24%, transparent)";

/** Small enough to read as a marker; a larger dot reads as a piece. */
const HINT_DOT_RADIUS = "17%";
/** The ring hugs the square's edge so the piece underneath stays legible. */
const HINT_RING_WIDTH = "9%";

export const HINT_STYLE: Record<"move" | "capture" | "selected", CSSProperties> = {
  /** The square the piece came from, so the dots have a visible origin. */
  selected: { backgroundColor: HINT_COLOR },
  move: {
    backgroundImage: `radial-gradient(circle at center, ${HINT_COLOR} ${HINT_DOT_RADIUS}, transparent ${HINT_DOT_RADIUS})`,
  },
  capture: {
    backgroundImage: `radial-gradient(circle at center, transparent calc(50% - ${HINT_RING_WIDTH}), ${HINT_COLOR} calc(50% - ${HINT_RING_WIDTH}))`,
  },
};
