/**
 * Won, lost or drew — from the player's seat, not the scoresheet's.
 *
 * The scoresheet says `1-0`; whether that is a win depends on which side
 * the player was, so the result and the resolved seat have to be read
 * together. Lives here, beside `perspective.ts`, so the screen that
 * renders an outcome and any other reader answer from one definition
 * rather than each deciding again.
 *
 * The SQL filter in `libs/infra/db` is the one expression of this rule
 * that cannot call it — a predicate runs inside Postgres. It is held to
 * this function by the route tests in
 * `apps/server/tests/library-filters.test.ts`, not by shared code.
 */

/** The PGN result marker, as the game record stores it. */
export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export type GameOutcome = "win" | "loss" | "draw" | "unfinished";

/**
 * A draw is a draw from either seat, and from no seat at all — the
 * result alone settles it, so it is answered before the seat is
 * consulted. Everything else needs to know who the player was: a game
 * still in progress, and a game nobody is attributed in, are both
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
