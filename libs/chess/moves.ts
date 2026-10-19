/**
 * Moves — the actual "is this legal, and what are all the legal ones"
 * surface. This is the core of the RULES premise: who validates
 * lance/legalidade.
 */

import type { Context, Position } from "chessops/chess";
import { castlingSide, normalizeMove } from "chessops/chess";
import { SquareSet } from "chessops/squareSet";
import {
  type Color,
  type DropMove,
  isDrop,
  isNormal,
  type Move,
  type NormalMove,
  type Role,
} from "chessops/types";
import { makeSquare, makeUci, parseSquare, parseUci } from "chessops/util";
import { makeSan, parseSan } from "chessops/san";

import { makeFen } from "./fen.ts";

export { isDrop, isNormal, castlingSide };
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
 * one entry per destination square. Works for either side's piece, not
 * only `pos.turn` — same reasoning as `playMove`: a caller exploring what
 * the other side could have played needs its hints too, not just the
 * side whose turn it technically is.
 */
export function legalDestinations(pos: Position, square: string): LegalDestination[] {
  const from = parseSquare(square);
  if (from === undefined) return [];
  const piece = pos.board.get(from);
  if (!piece) return [];

  const working = piece.color === pos.turn ? pos : outOfTurn(pos, piece.color);

  const seen = new Map<string, LegalDestination>();
  for (const move of legalMoves(working, from)) {
    if (!isNormal(move)) continue;
    const name = makeSquare(move.to);
    seen.set(name, {
      square: name,
      // Occupancy answers ordinary captures; en passant lands on an empty
      // square and still takes a pawn, which `pos.board` alone would miss.
      isCapture: working.board.get(move.to) !== undefined || isEnPassant(working, move),
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

/** The result of actually playing a move, not just checking it. */
export interface PlayedMove {
  fen: string;
  san: string;
  uci: string;
  /** The color of the piece that moved — `pos.turn` when the move was
   * played in turn, the other side when exploring what it could have
   * played instead (see `playMove`). */
  mover: Color;
}

/**
 * Validates and applies one move from `from` to `to`, without mutating
 * `pos`. Accepts a move for either side, not only `pos.turn` — exploring
 * "what the other side could have played here instead" needs the same
 * legality rules, just evaluated as if it were that side's move. Promotion
 * defaults to queen — no picker in this app yet, but the parameter stays
 * real so a future caller (a puzzle trainer, say) can override it.
 * Returns null on an illegal move or an empty `from` square, same
 * contract as `legalMoveBetween`.
 */
export function playMove(
  pos: Position,
  from: string,
  to: string,
  promotion: Role = "queen",
): PlayedMove | null {
  const square = parseSquare(from);
  const piece = square === undefined ? undefined : pos.board.get(square);
  if (!piece) return null;

  const working = piece.color === pos.turn ? pos : outOfTurn(pos, piece.color);

  // chessops' isLegal rejects any move whose `promotion` doesn't match
  // "is this actually a pawn landing on the back rank" — so a `queen`
  // default can't be passed unconditionally. Try with it first (only a
  // genuine promotion can succeed), fall back without it for everything
  // else.
  const move =
    legalMoveBetween(working, from, to, promotion) ?? legalMoveBetween(working, from, to);
  if (!move) return null;

  // makeSan clones internally and must run before the position is played.
  const san = makeSan(working, move);
  const uci = makeUci(move);

  const next = working.clone();
  next.play(move);

  return { fen: makeFen(next.toSetup()), san, uci, mover: piece.color };
}

/**
 * A copy of `pos` with the given side to move instead — en passant
 * cleared, since that right belongs to whichever side just moved and
 * doesn't carry over to a hypothetical move by the other side.
 */
function outOfTurn(pos: Position, color: Color): Position {
  const flipped = pos.clone();
  flipped.turn = color;
  flipped.epSquare = undefined;
  return flipped;
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
    const G_FILE = 6;
    const C_FILE = 2;
    const kingFile = side === "h" ? G_FILE : C_FILE;
    return {
      from: makeSquare(move.from),
      to: makeSquare(kingFile + 8 * (move.to >> 3)),
    };
  }

  return { from: makeSquare(move.from), to: makeSquare(move.to) };
}
