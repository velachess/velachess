import type { LegalDestination } from "@velachess/chess";
import {
  legalDestinations,
  makeSan,
  parseUci,
  positionFromFen,
  resolveGamePerspective,
} from "@velachess/chess";

export type Seat = "white" | "black";

/** The seat `@velachess/chess` resolves, else white — somewhere to start,
 * not evidence about who the person is. */
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

/** Nulls become absent: initials stand in for an unknown picture. */
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

/** Drag hints for the position on screen. */
export function legalTargetsAt(fen: string, square: string): readonly LegalDestination[] {
  return positionFromFen(fen).unwrap(
    (position) => legalDestinations(position, square),
    () => [],
  );
}

/**
 * `makeSan` will happily name a move nobody could play, so a record
 * drifted from its FEN would render a confident, impossible suggestion —
 * hence the legality check.
 */
export function sanOfUciAt(fen: string, uci: string): string | null {
  return positionFromFen(fen).unwrap(
    (position) => {
      const move = parseUci(uci);
      if (!move || !position.isLegal(move)) return null;
      return makeSan(position, move);
    },
    () => null,
  );
}
