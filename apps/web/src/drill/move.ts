import type { LegalDestination, MoveSquares } from "@velachess/chess";
import {
  legalDestinations,
  legalMoveBetween,
  makeSan,
  squaresOfSan,
  makeFen,
  positionFromFen,
} from "@velachess/chess";

/** Both SAN (for the answer endpoint) and FEN (for the board) — an unchanged `position` prop snaps the piece back either way. */
export interface PlayedMove {
  san: string;
  fen: string;
}

export function playMove(fen: string, from: string, to: string): PlayedMove | null {
  try {
    const position = positionFromFen(fen).unwrap();
    // Queen by default. `legalMoveBetween` is what decides whether the
    // promotion is even asked for, and whether dragging the king to g1
    // means castling — both are rules, and both live in chessops.
    const move =
      legalMoveBetween(position, from, to) ??
      legalMoveBetween(position, from, to, "queen");
    if (!move) return null;

    const san = makeSan(position, move);
    position.play(move);
    return { san, fen: makeFen(position.toSetup()) };
  } catch {
    return null;
  }
}

export function sideToMove(fen: string): "white" | "black" {
  try {
    return positionFromFen(fen).unwrap().turn;
  } catch {
    return "white";
  }
}

/** Hands off to `@velachess/chess` for legality — used to decide captures by square occupancy, which is wrong for en passant. */
export function legalTargetsFrom(fen: string, square: string): LegalDestination[] {
  try {
    return legalDestinations(positionFromFen(fen).unwrap(), square);
  } catch {
    return [];
  }
}

export function squaresOfSanAt(fen: string, san: string): MoveSquares | null {
  try {
    return squaresOfSan(positionFromFen(fen).unwrap(), san);
  } catch {
    return null;
  }
}
