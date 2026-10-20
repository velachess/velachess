/**
 * What a review is, and every rule for moving around in one: pure, with
 * no React, no zustand and no engine. A transition answers "what would
 * change" and the store is what applies it.
 *
 * Chess itself is `@velachess/chess`'s — legality, whose turn it is and
 * the notation all come from there.
 */
import type { MoveSquares } from "@velachess/chess";
import { playMove, positionFromFen, sideToMoveOf } from "@velachess/chess";

import type { GradedPly } from "../analysis/index.ts";
import { fenAtPly, type ReplayMove } from "./game-record.ts";

/**
 * The grade on one ply, if the run has reached it. Grades are published
 * in ply order, so the array is a prefix of the game; the ply is checked
 * rather than trusted, so a mismatch reads as ungraded instead of
 * handing back a different move's grade.
 */
export function gradeAtPly(
  graded: readonly GradedPly[],
  ply: number,
): GradedPly | undefined {
  const move = graded[ply - 1];
  return move?.ply === ply ? move : undefined;
}

export const REPLAY_NAVIGATION = {
  START: "start",
  MOVE: "move",
} as const;

type ReplayNavigationEvent =
  | { type: typeof REPLAY_NAVIGATION.START }
  | { type: typeof REPLAY_NAVIGATION.MOVE; move: ReplayMove };

export type ReplayNavigation = (event: ReplayNavigationEvent) => void;

/** All a review needs of the game it is a review of. */
export interface ReviewGame {
  moves: readonly ReplayMove[];
  startFen: string;
}

/** One half-move of a variation, carrying the position it produced. */
interface VariationMove {
  move: MoveSquares;
  san: string;
  fen: string;
}

/** A line played from one ply of the real game. One line, not a tree. */
export interface Variation {
  originPly: number;
  moves: VariationMove[];
  /** 1-based: how many of the line's moves are on the board. Never 0 — a
   * variation with nothing shown is the game itself. */
  cursor: number;
}

/** What the engine said about one position, and which position that was. */
export interface VariationEvaluation {
  fen: string;
  score: GradedPly["evalAfter"];
}

export interface ReviewData {
  /** The game, as it arrived. Never written to. */
  readonly moves: readonly ReplayMove[];
  readonly startFen: string;

  /** One half-move. 0 is the position before anyone moved. */
  ply: number;
  variation: Variation | null;
  /**
   * Tagged with the position the engine actually searched. The bar may
   * keep showing this number while a newer FEN is still being searched,
   * and `fen` is what says which position it belongs to — so "not yet
   * known" never reads as known. Null outside a variation, which is what
   * restores the report's own evaluation.
   */
  variationEvaluation: VariationEvaluation | null;
  /** The engine's move someone asked to see, as SAN. */
  preview: string | null;
}

/** A change to apply, and what it announces once applied. */
export interface ReviewTransition {
  data: Partial<ReviewData>;
  announce: ReplayNavigationEvent | null;
}

export function initialReviewState(game: ReviewGame): ReviewData {
  return {
    moves: game.moves,
    startFen: game.startFen,
    ply: 0,
    variation: null,
    variationEvaluation: null,
    preview: null,
  };
}

/** The variation's own position, when one is open. */
export function variationFen(variation: Variation | null): string | null {
  if (!variation) return null;
  return variation.moves[variation.cursor - 1]?.fen ?? null;
}

/** The position on the board: the variation's when one is open, the game's otherwise. */
export function selectFen(state: ReviewData): string {
  return (
    variationFen(state.variation) ?? fenAtPly(state.moves, state.startFen, state.ply)
  );
}

export function selectTotalPlies(state: ReviewData): number {
  return state.moves.length;
}

/**
 * Previous doubles as the way out of a variation — there is no exit
 * button, just the line to walk back down. Exploring from the very first
 * position has no real move behind it, so the variation itself is what
 * keeps Previous available.
 */
export function selectCanGoBack(state: ReviewData): boolean {
  return state.ply > 0 || state.variation !== null;
}

export function selectCanGoForward(state: ReviewData): boolean {
  return state.variation === null && state.ply < state.moves.length;
}

/** The real game's move at the ply on screen; absent at the start. */
export function selectGameMove(state: ReviewData): ReplayMove | undefined {
  return state.moves[state.ply - 1];
}

/** The variation's move on the board, when one is open. */
export function selectVariationMove(state: ReviewData): MoveSquares | null {
  const { variation } = state;
  if (!variation) return null;
  return variation.moves[variation.cursor - 1]?.move ?? null;
}

/** The notation of whichever move the board is showing. */
export function selectShowingSan(state: ReviewData): string | null {
  const { variation } = state;
  if (variation) return variation.moves[variation.cursor - 1]?.san ?? null;
  return selectGameMove(state)?.san ?? null;
}

/**
 * Where a jump lands, and what it announces. Null when it would change
 * nothing — a jump onto the ply already on screen, with no variation to
 * leave, is not navigation.
 */
export function goToPlyState(state: ReviewData, target: number): ReviewTransition | null {
  const ply = Math.min(Math.max(target, 0), state.moves.length);
  if (ply === state.ply && state.variation === null) return null;

  const move = state.moves[ply - 1];
  return {
    data: { ply, variation: null, variationEvaluation: null, preview: null },
    announce:
      ply === state.ply
        ? null
        : move
          ? { type: REPLAY_NAVIGATION.MOVE, move }
          : { type: REPLAY_NAVIGATION.START },
  };
}

/** Blocked for as long as a variation is on the board. */
export function nextReviewState(state: ReviewData): ReviewTransition | null {
  if (state.variation) return null;
  return goToPlyState(state, state.ply + 1);
}

/** Down the variation first, one move at a time, then back into the game. */
export function previousReviewState(state: ReviewData): ReviewTransition | null {
  const { variation } = state;

  if (variation && variation.cursor > 1) {
    return {
      data: { variation: { ...variation, cursor: variation.cursor - 1 } },
      announce: null,
    };
  }
  if (variation) {
    return { data: { variation: null, variationEvaluation: null }, announce: null };
  }
  return goToPlyState(state, state.ply - 1);
}

/**
 * The line a move would make, or null when it is not a move this
 * position allows. Playing after walking the cursor back replaces the
 * continuation rather than branching off it.
 */
export function playVariationMove(
  state: ReviewData,
  from: string,
  to: string,
): Variation | null {
  const fen = selectFen(state);
  const played = playMove(positionFromFen(fen).unwrap(), from, to);
  // The rules allow moving either side's piece from a given position; a
  // variation is a game being played, so it is the turn's to move.
  if (!played || played.mover !== sideToMoveOf(fen)) return null;

  const kept = state.variation
    ? state.variation.moves.slice(0, state.variation.cursor)
    : [];

  return {
    originPly: state.variation?.originPly ?? state.ply,
    moves: [...kept, { move: { from, to }, san: played.san, fen: played.fen }],
    cursor: kept.length + 1,
  };
}
