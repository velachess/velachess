import type { LegalDestination, MoveSquares } from "@velachess/chess";
import {
  legalDestinations,
  makeSan,
  parseUci,
  positionFromFen,
  resolveGamePerspective,
  squaresOfSan,
} from "@velachess/chess";

// What the board shows: which way round it sits, who occupies each seat,
// and the squares drawn on top of the position on screen.

export type Seat = "white" | "black";

/** Board perspective: the seat `@velachess/chess` resolves, else white — somewhere for the board to start, not evidence about who the person is. */
export function seatOf(
  game: { perspective: Seat | null; whiteName: string; blackName: string },
  mine: readonly string[],
): Seat {
  return resolveGamePerspective(game, mine) ?? "white";
}

export interface SeatIdentity {
  /** Provider profile picture, resolved server-side from the profile
   * cache. Absent when unknown — initials stand in. */
  avatarUrl?: string;
  /** Lichess asset id, decorated beside the name. Never an avatar. */
  flair?: string;
}

/**
 * The provider identity of one seat, as the game detail payload carried
 * it in — the server resolves both players from a shared per-handle
 * cache, so an opponent needs no tracked account to have a face. Nulls
 * become absent: initials stand in for an unknown picture.
 */
export function seatIdentityOf(
  identity:
    | {
        avatarUrl: string | null;
        flair: string | null;
      }
    | undefined,
): SeatIdentity {
  if (!identity) return {};

  return {
    ...(identity.avatarUrl !== null ? { avatarUrl: identity.avatarUrl } : {}),
    ...(identity.flair !== null ? { flair: identity.flair } : {}),
  };
}

/** Wraps `squaresOfSan` to take a FEN instead of a parsed position, reusing its validation rather than naive slicing. */
export function squaresOfSanAt(fen: string, san: string): MoveSquares | null {
  try {
    return squaresOfSan(positionFromFen(fen).unwrap(), san);
  } catch {
    return null;
  }
}

/** Engine's move as an arrow, not a played position — keeps the board showing the choice the player faced. */
export function suggestedArrow(
  fen: string | undefined,
  san: string | null,
): MoveSquares | null {
  return fen && san ? squaresOfSanAt(fen, san) : null;
}

/** Drag hints for the position on screen. Wraps `legalDestinations` to take a FEN, same as `squaresOfSanAt`. */
export function legalTargetsAt(fen: string, square: string): readonly LegalDestination[] {
  try {
    return legalDestinations(positionFromFen(fen).unwrap(), square);
  } catch {
    return [];
  }
}

/**
 * The engine answers in UCI, which nobody reads. `parseUci` only reads
 * squares and `makeSan` will happily name a move nobody could play, so a
 * drifted record would otherwise render a confident, impossible
 * suggestion — hence the legality check.
 */
export function sanOfUciAt(fen: string, uci: string): string | null {
  try {
    const position = positionFromFen(fen).unwrap();
    const move = parseUci(uci);
    if (!move || !position.isLegal(move)) return null;
    return makeSan(position, move);
  } catch {
    return null;
  }
}
