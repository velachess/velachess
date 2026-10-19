import type { MoveSquares } from "@velachess/chess";
import { positionFromFen, resolveGamePerspective, squaresOfSan } from "@velachess/chess";

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

/** The previewed move, if it still belongs to the ply on screen — tying it to the ply makes navigating auto-dismiss it. */
export function previewFor(
  preview: { ply: number; san: string } | null,
  ply: number,
): string | null {
  return preview && preview.ply === ply ? preview.san : null;
}
