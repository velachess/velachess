/**
 * Every name listed, so what the app may reach for is this file rather than
 * whatever a module happens to export. chessops decides the rules and is
 * re-exported unchanged; this package adds what it does not answer,
 * including three rules that are not chess at all — which seat is yours,
 * whether you won, and how fast the game was — which live here because the
 * server and the browser must agree on them.
 */

export { INITIAL_FEN, parseFen } from "chessops/fen";
export { makeSan, parseSan } from "chessops/san";
export type { Color, Outcome } from "chessops/types";
export { opposite } from "chessops/util";

export { positionFromFen } from "./position.ts";
export type { Position } from "./position.ts";

export { legalDestinations, playMove, squaresOfSan, squaresOfUci } from "./moves.ts";
export type { LegalDestination, MoveSquares, PlayedMove } from "./moves.ts";
export { castlingSide, isNormal, parseUci } from "./moves.ts";
export type { Move } from "./moves.ts";

export { hasPlayableGame, isPlayableGame, replayMainline } from "./pgn.ts";
export type { ReplayedGame, ReplayedMove } from "./pgn.ts";
export { emptyHeaders, parsePgn } from "./pgn.ts";
export type { Game, PgnNodeData } from "./pgn.ts";

// VelaChess rules, not chess ones.
export { resolveGamePerspective } from "./perspective.ts";
export { gameOutcomeFor } from "./game-result.ts";
export type { GameOutcome, GameResult } from "./game-result.ts";
export {
  ESTIMATED_MOVES,
  TIME_CLASS_CEILINGS,
  TIME_CLASSES,
  timeClassOf,
} from "./time-class.ts";
export type { TimeClass } from "./time-class.ts";
