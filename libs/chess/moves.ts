/**
 * Moves — legality, and the two notations a board and an engine need.
 * chessops decides every rule here; this file exists for the three things
 * it does not answer: whether a destination captures, which of its two
 * castling notations a board and an engine read, and applying a move
 * without mutating the position.
 */

import type { Position } from "chessops/chess";
import { castlingSide, normalizeMove } from "chessops/chess";
import { isNormal, type Move, type NormalMove, type Role } from "chessops/types";
import { kingCastlesTo, makeSquare, makeUci, parseSquare, parseUci } from "chessops/util";
import { makeFen } from "chessops/fen";
import { makeSanAndPlay, parseSan } from "chessops/san";

export { castlingSide, isNormal, parseUci };
export type { Move };

/** A square a piece may legally reach, and what it would do there. */
export interface LegalDestination {
  square: string;
  /** True when a piece sits there — including en passant, where the
   * captured pawn is not on the destination. */
  isCapture: boolean;
}

/**
 * Where the piece on `square` may legally go — legal, not pseudo-legal;
 * `pos.dests` resolves pins, check, castling and en passant, and answers
 * empty for a piece whose turn it is not.
 *
 * Two things `dests` leaves to the caller. It names castling on the
 * rook's square, because that is how chessops encodes the move — a board
 * has to show the square the king lands on, which is also the one a
 * person drags to. And it does not say whether landing somewhere takes
 * a piece, which a board draws differently.
 */
export function legalDestinations(pos: Position, square: string): LegalDestination[] {
  const from = parseSquare(square);
  if (from === undefined) return [];

  return [...pos.dests(from)].map((to) => {
    const landing = castlingTarget(pos, { from, to });
    // Castling is never a capture, however occupied the rook's square is.
    if (landing !== null) return { square: makeSquare(landing), isCapture: false };

    return {
      square: makeSquare(to),
      isCapture: pos.board.get(to) !== undefined || isEnPassant(pos, from, to),
    };
  });
}

/** A pawn changing file onto an empty square has taken one in passing. */
function isEnPassant(pos: Position, from: number, to: number): boolean {
  if (pos.board.getRole(from) !== "pawn") return false;
  const changedFile = makeSquare(from)[0] !== makeSquare(to)[0];
  return changedFile && pos.board.get(to) === undefined;
}

/**
 * A move as chessops means it, or null if illegal here — the one gate
 * before playing anything. `normalizeMove` is what lets a person drag the
 * king to g1 when chessops encodes castling as king-takes-own-rook.
 */
function legalMoveBetween(
  pos: Position,
  from: string,
  to: string,
  promotion?: Role,
): Move | null {
  const origin = parseSquare(from);
  const target = parseSquare(to);
  if (origin === undefined || target === undefined) return null;

  const move = normalizeMove(pos, {
    from: origin,
    to: target,
    ...(promotion ? { promotion } : {}),
  });
  return pos.isLegal(move) ? move : null;
}

/** The result of actually playing a move, not just checking it. A caller
 * wanting the move in UCI has `uciOf`; nothing has, so it is not here. */
export interface PlayedMove {
  fen: string;
  san: string;
}

/**
 * Validates and applies one move, without mutating `pos`. Only the side
 * to move may play: `pos.dests` offers nothing to the other one, so
 * accepting its moves would mean a board that takes what it never
 * offered. Promotion defaults to queen — no picker in this app yet, but
 * the parameter stays real so a future caller can override it. Null on an
 * illegal move, same contract as the legality gate it runs.
 */
export function playMove(
  pos: Position,
  from: string,
  to: string,
  promotion: Role = "queen",
): PlayedMove | null {
  // chessops' isLegal rejects any move whose `promotion` doesn't match
  // "is this actually a pawn landing on the back rank" — so a `queen`
  // default can't be passed unconditionally. Try with it first (only a
  // genuine promotion can succeed), fall back without it for everything
  // else.
  const move =
    legalMoveBetween(pos, from, to, promotion) ?? legalMoveBetween(pos, from, to);
  if (!move) return null;

  // One clone, not two: `makeSan` is `makeSanAndPlay` on a clone of its
  // own, so playing our copy and naming the move are the same step. The
  // position handed in is never touched.
  const next = pos.clone();
  const san = makeSanAndPlay(next, move);

  return { fen: makeFen(next.toSetup()), san };
}

/** A move as the two squares a board draws between. */
export interface MoveSquares {
  from: string;
  to: string;
}

/**
 * Squares a UCI move touches, or null if not one. Uses `parseUci` rather
 * than slicing the string, so invalid strings like "z9z9" are rejected.
 */
export function squaresOfUci(uci: string): MoveSquares | null {
  const move = parseUci(uci);
  if (!move || !isNormal(move)) return null;
  return { from: makeSquare(move.from), to: makeSquare(move.to) };
}

/**
 * The castling square a board draws and an engine speaks, or null when the
 * move is not castling. chessops encodes castling as king-takes-own-rook
 * (e1 → h1) and names the king's landing square separately
 * (`kingCastlesTo`); choosing the second over the first is the one rule
 * behind both `squaresOfSan` and `uciOf`.
 */
function castlingTarget(pos: Position, move: NormalMove): number | null {
  const side = castlingSide(pos, move);
  if (!side) return null;
  return kingCastlesTo(pos.turn, side);
}

/**
 * Squares a SAN move touches; requires the position since SAN leaves the
 * origin implicit (e.g. which knight `Nf3` means depends on the board).
 */
export function squaresOfSan(pos: Position, san: string): MoveSquares | null {
  const move = parseSan(pos, san);
  if (!move || !isNormal(move)) return null;

  const to = castlingTarget(pos, move) ?? move.to;
  return { from: makeSquare(move.from), to: makeSquare(to) };
}

/**
 * UCI as an engine speaks it, which is not always what `makeUci` returns:
 * a castle has to read `e1g1`, or comparing a played move against the
 * engine's `bestmove` never matches and no castle is ever the best move.
 */
export function uciOf(pos: Position, move: Move): string {
  if (!isNormal(move)) return makeUci(move);

  const to = castlingTarget(pos, move);
  return to === null ? makeUci(move) : makeUci({ ...move, to });
}
