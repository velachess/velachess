/** Pure: every localisation is the screen's, needing an i18n instance. */

/**
 * From the clock, not the platform's label, which Lichess and chess.com
 * word differently for the same game.
 */
export function formatClock(
  initialSeconds: number | null,
  incrementSeconds: number | null,
) {
  if (initialSeconds === null) return null;

  const minutes = initialSeconds / 60;
  const base = Number.isInteger(minutes) ? `${minutes} min` : `${initialSeconds}s`;
  return incrementSeconds ? `${base} + ${incrementSeconds}` : base;
}
