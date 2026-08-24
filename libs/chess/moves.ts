/**
 * Moves — the actual "is this legal, and what are all the legal ones"
 * surface. This is the core of the RULES premise: who validates
 * lance/legalidade.
 */

import type { Context, Position } from "chessops/chess";
import { castlingSide, normalizeMove } from "chessops/chess";
import { SquareSet } from "chessops/squareSet";
import {
  type DropMove,
  isDrop,
  isNormal,
  type Move,
  type NormalMove,
  type Role,
} from "chessops/types";
import { makeSquare, makeUci, parseSquare, parseUci } from "chessops/util";
import { parseSan } from "chessops/san";

export { isDrop, isNormal };
export type { DropMove, Move, NormalMove };

/**
 * UCI is what engines speak and SAN is what people read, so a caller
 * holding an engine's answer needs both directions. Re-exported as-is —
 * chessops already gets this right.
 */
export { makeUci, parseUci };

const PROMOTION_ROLES: readonly Role[] = ["queen", "rook", "bishop", "knight"];

/**
 * Every legal move in the position (or from one square, if given), with a
 * separate entry per promotion choice. chessops' own `dests`/`allDests`
 * return only destination squares — a pawn reaching the last rank is one
 * destination, not four moves — so this is the one place that expansion
 * needs to happen, rather than every caller redoing it.
 */
export function legalMoves(pos: Position, square?: number, ctx?: Context): Move[] {
  const dests =
    square === undefined
      ? pos.allDests(ctx)
      : new Map([[square, pos.dests(square, ctx)]]);

  const moves: Move[] = [];
  for (const [from, destinations] of dests) {
    const isPawn = pos.board.getRole(from) === "pawn";

    for (const to of destinations) {
      if (isPawn && SquareSet.backranks().has(to)) {
        for (const promotion of PROMOTION_ROLES) {
          moves.push({ from, to, promotion });
        }
      } else {
        moves.push({ from, to });
      }
    }
  }
  return moves;
}

/** A square a piece may legally reach, and what it would do there. */
export interface LegalDestination {
  square: string;
  /** True when a piece sits there — including en passant, where the
   * captured pawn is not on the destination. */
  isCapture: boolean;
}

/**
 * Where the piece on `square` may legally go — legal, not pseudo-legal;
 * chessops resolves pins/check/castling/en passant. Promotions collapse to
 * one entry per destination square.
 */
export function legalDestinations(pos: Position, square: string): LegalDestination[] {
  const from = parseSquare(square);
  if (from === undefined) return [];

  const seen = new Map<string, LegalDestination>();
  for (const move of legalMoves(pos, from)) {
    if (!isNormal(move)) continue;
    const name = makeSquare(move.to);
    seen.set(name, {
      square: name,
      // Occupancy answers ordinary captures; en passant lands on an empty
      // square and still takes a pawn, which `pos.board` alone would miss.
      isCapture: pos.board.get(move.to) !== undefined || isEnPassant(pos, move),
    });
  }
  return [...seen.values()];
}

/** A pawn changing file onto an empty square has taken one in passing. */
function isEnPassant(pos: Position, move: NormalMove): boolean {
  if (pos.board.getRole(move.from) !== "pawn") return false;
  const changedFile = makeSquare(move.from)[0] !== makeSquare(move.to)[0];
  return changedFile && pos.board.get(move.to) === undefined;
}

/**
 * A move as chessops means it, or null if illegal here — the one gate before
 * playing anything. Uses `normalizeMove` because chessops encodes castling as
 * king-takes-own-rook (`e1h1`), not the `g1` a person drags to.
 */
export function legalMoveBetween(
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
 * Squares a SAN move touches; requires the position since SAN leaves the
 * origin implicit (e.g. which knight `Nf3` means depends on the board).
 * Castling comes back as the king's own two-square step (O-O → g1), not the
 * king-takes-own-rook encoding chessops uses internally — drawing wants the
 * square the king lands on, which is also what an engine's UCI would name.
 */
export function squaresOfSan(pos: Position, san: string): MoveSquares | null {
  const move = parseSan(pos, san);
  if (!move || !isNormal(move)) return null;

  const side = castlingSide(pos, move);
  if (side) {
    const kingFile = side === "h" ? 6 : 2; // g-file or c-file, zero-based
    return {
      from: makeSquare(move.from),
      to: makeSquare(kingFile + 8 * (move.to >> 3)),
    };
  }

  return { from: makeSquare(move.from), to: makeSquare(move.to) };
}
