/**
 * Bullet/blitz/rapid/classical from *estimated duration*
 * (`initial + 40 × increment`, Lichess's formula, close enough to
 * chess.com's too), not clock alone — 3+2 plays longer than 3+0.
 * Boundaries are exported so SQL filtering builds its predicate from
 * these same numbers instead of repeating them.
 *
 * The thresholds are a product convention borrowed from Lichess, not a
 * rule of chess. They live here, beside the rules that are, because the
 * input is a PGN time-control header and every reader — the library's
 * SQL filter and the games-list badge — needs the same answer. Same
 * reason `perspective.ts` lives here: a shared derivation belongs in the
 * one pure package every module may import.
 */

/** The vocabulary itself, as a tuple a request schema can be built from.
 * The list is the source and the union is read off it, so the two cannot
 * disagree. */
export const TIME_CLASSES = ["bullet", "blitz", "rapid", "classical"] as const;

export type TimeClass = (typeof TIME_CLASSES)[number];

/** Assumed moves per game — the multiplier on the increment. */
export const ESTIMATED_MOVES = 40;

/** Upper bound (exclusive) of estimated seconds per class. */
export const TIME_CLASS_CEILINGS: Record<Exclude<TimeClass, "classical">, number> = {
  bullet: 180,
  blitz: 480,
  rapid: 1500,
};

function estimatedSeconds(initialSeconds: number, incrementSeconds: number): number {
  return initialSeconds + ESTIMATED_MOVES * incrementSeconds;
}

/**
 * Null when the platform gave no clock — correspondence games and pasted
 * PGNs have none, and guessing a class for them would be a lie.
 */
export function timeClassOf(
  initialSeconds: number | null | undefined,
  incrementSeconds: number | null | undefined,
): TimeClass | null {
  if (initialSeconds === null || initialSeconds === undefined) return null;

  const seconds = estimatedSeconds(initialSeconds, incrementSeconds ?? 0);
  if (seconds < TIME_CLASS_CEILINGS.bullet) return "bullet";
  if (seconds < TIME_CLASS_CEILINGS.blitz) return "blitz";
  if (seconds < TIME_CLASS_CEILINGS.rapid) return "rapid";
  return "classical";
}
