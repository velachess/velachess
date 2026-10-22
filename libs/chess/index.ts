/**
 * Public surface for @velachess/chess — every name listed, so what the
 * app may reach for is this file rather than whatever a module happens
 * to export.
 *
 * chessops decides the rules; what it answers is re-exported unchanged,
 * never wrapped. This package adds only what it does not answer: a
 * replayed mainline as plain data, what a board needs to draw a move,
 * and three rules that are not chess at all — which seat is yours,
 * whether you won, and how fast the game was. Those three live here
 * because the server and the browser must agree on them and this is the
 * one package with no dependencies of its own; each states its rule in
 * its own file.
 */

// chessops, unchanged.
export { INITIAL_FEN, parseFen } from "chessops/fen";
export { makeSan, parseSan } from "chessops/san";
export type { Color, Outcome } from "chessops/types";

// A position, validated in one step.
export { positionFromFen } from "./position.ts";
export type { Position } from "./position.ts";

// What a board needs: where a piece may go, playing one, and the two
// notations a move is read in.
export { legalDestinations, playMove, squaresOfSan, squaresOfUci } from "./moves.ts";
export type { LegalDestination, MoveSquares, PlayedMove } from "./moves.ts";
export { castlingSide, isNormal, parseUci } from "./moves.ts";
export type { Move } from "./moves.ts";

// One game, interpreted once, and the policy for keeping it.
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
