/**
 * Drawn with the board's own SVGs rather than Unicode glyphs, which render
 * inconsistently. `defaultPieces` ships with react-chessboard, so this
 * cannot drift from the board.
 */

import { defaultPieces } from "react-chessboard";

import { cn } from "../lib/utils.ts";
import type { BoardSide } from "./board.tsx";

/** SAN names a piece by its uppercase letter, a pawn by saying nothing. */
export const PIECE_KINDS = ["K", "Q", "R", "B", "N", "P"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

const PAWN: PieceKind = "P";
const KING: PieceKind = "K";
const CASTLING_PREFIX = "O-O";

function isPieceKind(letter: string): letter is PieceKind {
  return PIECE_KINDS.some((kind) => kind === letter);
}

/** Castling names no piece and moves two, so it shows the king. */
export function pieceKindOf(san: string): PieceKind {
  if (san.startsWith(CASTLING_PREFIX)) return KING;
  const first = san[0] ?? "";
  return isPieceKind(first) ? first : PAWN;
}

export interface PieceIconProps {
  kind: PieceKind;
  side: BoardSide;
  className?: string;
}

/**
 * The `!` overrides matter because the library sets `stroke: #000000`
 * inline on the path, which outranks a class.
 */
const STROKE_FOLLOWS_TEXT = "[&_path]:!stroke-current [&_path]:![stroke-width:1.8]";

const FILL = {
  white: "[&_path]:!fill-transparent",
  black: "[&_path]:!fill-current",
} as const satisfies Record<BoardSide, string>;

export function PieceIcon({ kind, side, className }: PieceIconProps) {
  const render = defaultPieces[`${side === "white" ? "w" : "b"}${kind}`];
  if (!render) return null;

  return (
    // `defaultPieces` draws at `width: 100%` to fill a board square, so
    // inline it needs a box, and `1em` ties it to its text.
    <span
      aria-hidden
      className={cn(
        "inline-block size-[1em] shrink-0 align-[-0.15em]",
        STROKE_FOLLOWS_TEXT,
        FILL[side],
        className,
      )}
    >
      {render()}
    </span>
  );
}
