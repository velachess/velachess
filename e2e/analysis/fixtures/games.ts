/**
 * Two games, sized for a real engine in CI: four plies for everything that
 * only needs a finished pass, ten for the two tests that have to act while
 * one is still running. Nothing longer exists to reuse — the repository's
 * other fixtures top out at seven plies and carry results a review record
 * would not.
 */
import { landingGame } from "../../../apps/web/src/games/review/tests/fixtures/landing-game.ts";

export { LANDING_GAME_ID } from "../../../apps/web/src/games/review/tests/fixtures/landing-game.ts";

/** `1. f3 e5 2. g4 Qh4#` — four plies, the blunder on `g4`. */
export const shortGame = landingGame;

export const MID_GAME_ID = "e2e-mid-game";

const MID_GAME_PGN = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0";

/** Ten quiet plies, so a pass outlives a navigation or a reload. */
export const midGame = {
  ...landingGame,
  id: MID_GAME_ID,
  // Its own opponent: the games list names a row by who was across the
  // board, and two rows with one name are one ambiguous locator.
  blackName: "mid_rival",
  result: "1-0",
  termination: "by resignation",
  openingName: "Ruy Lopez",
  openingEco: "C70",
  externalUrl: "https://www.chess.com/game/live/100000000002",
  rawPgn: MID_GAME_PGN,
};

export const MID_GAME_PLIES = 10;
export const SHORT_GAME_PLIES = 4;
