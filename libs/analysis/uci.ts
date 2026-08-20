import type { Move, Role } from "@velachess/chess";
import { isNormal } from "@velachess/chess";

const FILES = "abcdefgh";
/** UCI letters — note knight is "n". */
const ROLE_LETTER: Record<Role, string> = {
  pawn: "p",
  knight: "n",
  bishop: "b",
  rook: "r",
  queen: "q",
  king: "k",
};

function squareName(square: number): string {
  return `${FILES[square & 7]}${(square >> 3) + 1}`;
}

/** UCI string for a move, to compare against the engine's bestmove reply. */
export function uciOf(move: Move): string {
  if (!isNormal(move))
    return `${ROLE_LETTER[move.role].toUpperCase()}@${squareName(move.to)}`;
  return `${squareName(move.from)}${squareName(move.to)}${move.promotion ? ROLE_LETTER[move.promotion] : ""}`;
}
