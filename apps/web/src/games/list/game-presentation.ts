/** Pure: every localisation is the screen's, needing an i18n instance. */
import type { Game } from "./queries.ts";

/** Null when the game was never attributed: calling one of the players
 * the opponent would invent a seat nobody knows. */
export function opponentSideOf(game: Game): "white" | "black" | null {
  if (game.perspective === null) return null;
  return game.perspective === "black" ? "white" : "black";
}

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
