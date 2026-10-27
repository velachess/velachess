import type { LegalDestination } from "@velachess/chess";
import {
  legalDestinations,
  makeSan,
  parseUci,
  positionFromFen,
  resolveGamePerspective,
} from "@velachess/chess";

export type Seat = "white" | "black";

/** The seat `@velachess/chess` resolves, else white: somewhere to start,
 * not evidence about who the person is. */
export function seatOf(
  game: { perspective: Seat | null; whiteName: string; blackName: string },
  mine: readonly string[],
): Seat {
  return resolveGamePerspective(game, mine) ?? "white";
}

export function legalTargetsAt(fen: string, square: string): readonly LegalDestination[] {
  return positionFromFen(fen).unwrap(
    (position) => legalDestinations(position, square),
    () => [],
  );
}

/**
 * `makeSan` will name a move nobody could play, so without the legality
 * check a record drifted from its FEN renders an impossible suggestion.
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
