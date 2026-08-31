/**
 * [UI] Style values for react-chessboard, which takes CSSProperties (not
 * classNames) for squares/notation/frame. Values come from CSS custom
 * properties in `styles/theme.css` — no literal colours here.
 */

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
  /**
   * The library's own board root defaults to `overflow: hidden`. A
   * `SquareBadge` deliberately sits a few pixels past its square's corner
   * (see square-badge.tsx), which an interior square's neighbour absorbs —
   * but on an edge square that overflow crosses the board root itself and
   * gets clipped. The drag ghost is unaffected: it renders through
   * `@dnd-kit`'s `DragOverlay`, a portal outside this element entirely.
   */
  frame: { overflow: "visible" },
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
