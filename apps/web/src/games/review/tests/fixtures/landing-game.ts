export const LANDING_PLAYER = "vela_player";
const LANDING_OPPONENT = "night_shift";
export const LANDING_GAME_ID = "landing-game-analysis";
const LANDING_GAME_PGN = "1. f3 e5 2. g4 Qh4# 0-1";

/** Both reads carry a seat's cached provider identity; this handle has
 * none. */
const NO_IDENTITY = { avatarUrl: null, flair: null, countryCode: null } as const;

export const landingGame = {
  id: LANDING_GAME_ID,
  whiteName: LANDING_PLAYER,
  whiteRating: 1542,
  blackName: LANDING_OPPONENT,
  blackRating: 1588,
  result: "0-1",
  playedAt: "2026-08-18T19:30:00.000Z",
  perspective: "white",
  source: "chess_com",
  externalUrl: "https://www.chess.com/game/live/100000000001",
  timeControlInitialSeconds: 600,
  timeControlIncrementSeconds: 0,
  openingName: "Barnes Opening",
  openingEco: "A00",
  termination: "by checkmate",
  rawPgn: LANDING_GAME_PGN,
  whiteIdentity: NO_IDENTITY,
  blackIdentity: NO_IDENTITY,
} as const;
