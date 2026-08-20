/**
 * Bullet/blitz/rapid/classical from *estimated duration*
 * (`initial + 40 × increment`, Lichess's formula, close enough to
 * chess.com's too), not clock alone — 3+2 plays longer than 3+0.
 * Boundaries are exported so SQL filtering builds its predicate from
 * these same numbers instead of repeating them.
 */

export type TimeClass = "bullet" | "blitz" | "rapid" | "classical";

export const TIME_CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical"];

/** Assumed moves per game — the multiplier on the increment. */
export const ESTIMATED_MOVES = 40;

/** Upper bound (exclusive) of estimated seconds per class. */
export const TIME_CLASS_CEILINGS: Record<Exclude<TimeClass, "classical">, number> = {
  bullet: 180,
  blitz: 480,
  rapid: 1500,
};

export function estimatedSeconds(
  initialSeconds: number,
  incrementSeconds: number,
): number {
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
