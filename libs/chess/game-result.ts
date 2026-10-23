/**
 * Won, lost or drew from the player's seat: `1-0` is a win only once the
 * seat is known, so the result and the seat are read together.
 *
 * The SQL filter in `libs/infra/db` cannot call this, and
 * `apps/server/tests/library-filters.test.ts` is what holds it here.
 */

/** The PGN result marker, as the game record stores it. */
export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export type GameOutcome = "win" | "loss" | "draw" | "unfinished";

/**
 * A draw is settled by the result alone, before the seat is consulted. A
 * game still in progress and a game nobody is attributed in are both
 * `unfinished` rather than a guessed win or loss.
 */
export function gameOutcomeFor(
  result: GameResult,
  perspective: "white" | "black" | null,
): GameOutcome {
  if (result === "1/2-1/2") return "draw";
  if (result === "*" || perspective === null) return "unfinished";

  const playerWon = perspective === "white" ? result === "1-0" : result === "0-1";
  return playerWon ? "win" : "loss";
}
