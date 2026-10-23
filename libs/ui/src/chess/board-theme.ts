/**
 * react-chessboard takes CSSProperties, not classNames, so every colour
 * here reads a custom property from `styles/theme.css`.
 */

import type { CSSProperties } from "react";

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

/** Not move categories: callers map their own vocabulary onto these. */
export const BADGE_TONES = ["ok", "inaccuracy", "mistake", "blunder", "book"] as const;

export type BadgeTone = (typeof BADGE_TONES)[number];

export const BADGE_TONE_COLOR: Record<BadgeTone, string> = {
  ok: cssVar(TOKEN.gradeOk),
  inaccuracy: cssVar(TOKEN.gradeInaccuracy),
  mistake: cssVar(TOKEN.gradeMistake),
  blunder: cssVar(TOKEN.gradeBlunder),
  book: cssVar(TOKEN.highlight),
};

export interface BadgeEdges {
  right: boolean;
  top: boolean;
}

/** The file and rank along the right and top edges, from the bottom
 * seat. */
const BOARD_EDGES = {
  white: { file: "h", rank: "8" },
  black: { file: "a", rank: "1" },
} as const;

/** A badge sits on the top-right corner, which those edges would push off
 * the board. */
export function badgeEdgesOf(
  square: string,
  orientation: keyof typeof BOARD_EDGES,
): BadgeEdges {
  const [file, rank] = square;
  const edges = BOARD_EDGES[orientation];
  return { right: file === edges.file, top: rank === edges.rank };
}

export const ARROW_BEST = cssVar(TOKEN.gradeOk);

/** Off the grade ramp, where green means "best" and red "lost something",
 * and a suggestion is neither. */
export const ARROW_SUGGESTED = cssVar(TOKEN.suggested);

export const BOARD_STYLE = {
  light: { backgroundColor: cssVar(TOKEN.lightSquare) },
  dark: { backgroundColor: cssVar(TOKEN.darkSquare) },
  highlight: { backgroundColor: cssVar(TOKEN.highlight) },
} as const satisfies Record<string, React.CSSProperties>;

export const NOTATION_STYLE = {
  onLight: { color: cssVar(TOKEN.notationOnLight) },
  onDark: { color: cssVar(TOKEN.notationOnDark) },
} as const satisfies Record<string, React.CSSProperties>;

/**
 * Stepping with the arrow keys is faster than any easing curve, so the
 * replay turns animation off rather than queueing it.
 */
export const ANIMATION_DURATION_MS = 180;

/**
 * Painted as a radial-gradient because `squareStyles` accepts CSS
 * properties, not child nodes.
 */
const HINT_COLOR = "color-mix(in oklab, var(--foreground) 24%, transparent)";

/** A larger dot reads as a piece. */
const HINT_DOT_RADIUS = "17%";
/** Hugs the square's edge, so the piece underneath stays legible. */
const HINT_RING_WIDTH = "9%";

export const HINT_STYLE: Record<"move" | "capture" | "selected", CSSProperties> = {
  selected: { backgroundColor: HINT_COLOR },
  move: {
    backgroundImage: `radial-gradient(circle at center, ${HINT_COLOR} ${HINT_DOT_RADIUS}, transparent ${HINT_DOT_RADIUS})`,
  },
  capture: {
    backgroundImage: `radial-gradient(circle at center, transparent calc(50% - ${HINT_RING_WIDTH}), ${HINT_COLOR} calc(50% - ${HINT_RING_WIDTH}))`,
  },
};
