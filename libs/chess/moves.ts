/**
 * chessops decides every rule; this file exists for the three it does not
 * answer: whether a destination captures, which castling notation to read,
 * and applying a move without mutating the position.
 */

import type { Position } from "chessops/chess";
import { castlingSide, normalizeMove } from "chessops/chess";
import { isNormal, type Move, type NormalMove, type Role } from "chessops/types";
import { kingCastlesTo, makeSquare, makeUci, parseSquare, parseUci } from "chessops/util";
import { makeFen } from "chessops/fen";
import { makeSanAndPlay, parseSan } from "chessops/san";

export { castlingSide, isNormal, parseUci };
export type { Move };

export interface LegalDestination {
  square: string;
  /** True when a piece sits there — including en passant, where the
   * captured pawn is not on the destination. */
  isCapture: boolean;
}

/**
 * `pos.dests` resolves pins, check, castling and en passant, but names
 * castling on the rook's square and does not say whether a destination
 * captures.
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
 * `normalizeMove` is what lets a person drag the king to g1, chessops
 * encoding castling as king-takes-own-rook.
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

export interface PlayedMove {
  fen: string;
  san: string;
}

/**
 * Without mutating `pos`. Only the side to move may play, `pos.dests`
 * offering nothing to the other one, and promotion defaults to queen
 * because this app has no picker.
 */
export function playMove(
  pos: Position,
  from: string,
  to: string,
  promotion: Role = "queen",
): PlayedMove | null {
  // chessops' isLegal rejects a `promotion` on anything but a pawn
  // reaching the back rank, so the default cannot be passed
  // unconditionally: try with it, fall back without.
  const move =
    legalMoveBetween(pos, from, to, promotion) ?? legalMoveBetween(pos, from, to);
  if (!move) return null;

  // One clone: `makeSan` clones internally, so playing our copy and naming
  // the move are the same step.
  const next = pos.clone();
  const san = makeSanAndPlay(next, move);

  return { fen: makeFen(next.toSetup()), san };
}

export interface MoveSquares {
  from: string;
  to: string;
}

/** `parseUci` rather than slicing, so "z9z9" is rejected. */
export function squaresOfUci(uci: string): MoveSquares | null {
  const move = parseUci(uci);
  if (!move || !isNormal(move)) return null;
  return { from: makeSquare(move.from), to: makeSquare(move.to) };
}

/**
 * chessops encodes castling as king-takes-own-rook (e1 → h1) and names
 * the king's landing square separately. Choosing the second is the one
 * rule behind both `squaresOfSan` and `uciOf`.
 */
function castlingTarget(pos: Position, move: NormalMove): number | null {
  const side = castlingSide(pos, move);
  if (!side) return null;
  return kingCastlesTo(pos.turn, side);
}

/** Requires the position: SAN leaves the origin implicit — which knight
 * `Nf3` means depends on the board. */
export function squaresOfSan(pos: Position, san: string): MoveSquares | null {
  const move = parseSan(pos, san);
  if (!move || !isNormal(move)) return null;

  const to = castlingTarget(pos, move) ?? move.to;
  return { from: makeSquare(move.from), to: makeSquare(to) };
}

/**
 * Not always what `makeUci` returns: a castle has to read `e1g1`, or
 * comparing a played move against the engine's `bestmove` never matches
 * and no castle is ever the best move.
 */
export function uciOf(pos: Position, move: Move): string {
  if (!isNormal(move)) return makeUci(move);

  const to = castlingTarget(pos, move);
  return to === null ? makeUci(move) : makeUci({ ...move, to });
}
