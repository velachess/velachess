/**
 * What a review is, and every rule for moving around in one: pure, with
 * no React, no zustand and no engine. A transition answers "what would
 * change" and the store is what applies it.
 *
 * Chess itself is `@velachess/chess`'s — legality, whose turn it is and
 * the notation all come from there.
 */
import type { MoveSquares } from "@velachess/chess";
import { playMove, positionFromFen, type ReplayedMove } from "@velachess/chess";

import type { GradedPly } from "../analysis/index.ts";
import { fenAtPly } from "./game-record.ts";

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
  | { type: typeof REPLAY_NAVIGATION.MOVE; move: ReplayedMove };

export type ReplayNavigation = (event: ReplayNavigationEvent) => void;

/**
 * All a review needs of the game it is a review of. It is a parameter, not
 * state: the replay belongs to `gameQuery`, and copying it into a snapshot
 * would make the same fact answerable from two places.
 */
export interface ReviewGame {
  moves: readonly ReplayedMove[];
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
  moves: VariationMove[];
  /** 1-based: how many of the line's moves are on the board. Never 0 — a
   * variation with nothing shown is the game itself. */
  cursor: number;
}

/** What someone is doing in a review, and nothing else. */
export interface ReviewData {
  /** One half-move. 0 is the position before anyone moved. */
  ply: number;
  variation: Variation | null;
  /** Someone asked to see the engine's move for the ply on screen. The
   * move itself is the report's — this is only the asking. */
  showBestMove: boolean;
}

/** A change to apply, and what it announces once applied. */
export interface ReviewTransition {
  data: Partial<ReviewData>;
  announce: ReplayNavigationEvent | null;
}

export const INITIAL_REVIEW: ReviewData = {
  ply: 0,
  variation: null,
  showBestMove: false,
};

/** The variation's own position, when one is open. */
export function variationFen(variation: Variation | null): string | null {
  if (!variation) return null;
  return variation.moves[variation.cursor - 1]?.fen ?? null;
}

/** The position on the board: the variation's when one is open, the game's otherwise. */
export function selectFen(state: ReviewData, game: ReviewGame): string {
  return variationFen(state.variation) ?? fenAtPly(game.moves, game.startFen, state.ply);
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

export function selectCanGoForward(state: ReviewData, game: ReviewGame): boolean {
  return state.variation === null && state.ply < game.moves.length;
}

/** The real game's move at the ply on screen; absent at the start. */
export function selectGameMove(
  state: ReviewData,
  game: ReviewGame,
): ReplayedMove | undefined {
  return game.moves[state.ply - 1];
}

/** The variation's move on the board, when one is open. */
export function selectVariationMove(state: ReviewData): MoveSquares | null {
  const { variation } = state;
  if (!variation) return null;
  return variation.moves[variation.cursor - 1]?.move ?? null;
}

/** The notation of whichever move the board is showing. */
export function selectShowingSan(state: ReviewData, game: ReviewGame): string | null {
  const { variation } = state;
  if (variation) return variation.moves[variation.cursor - 1]?.san ?? null;
  return selectGameMove(state, game)?.san ?? null;
}

/**
 * Where a jump lands, and what it announces. Null when it would change
 * nothing — a jump onto the ply already on screen, with no variation to
 * leave, is not navigation.
 */
export function goToPlyState(
  state: ReviewData,
  game: ReviewGame,
  target: number,
): ReviewTransition | null {
  const ply = Math.min(Math.max(target, 0), game.moves.length);
  if (ply === state.ply && state.variation === null) return null;

  const move = game.moves[ply - 1];
  return {
    data: { ply, variation: null, showBestMove: false },
    announce:
      ply === state.ply
        ? null
        : move
          ? { type: REPLAY_NAVIGATION.MOVE, move }
          : { type: REPLAY_NAVIGATION.START },
  };
}

/** Blocked for as long as a variation is on the board. */
export function nextReviewState(
  state: ReviewData,
  game: ReviewGame,
): ReviewTransition | null {
  if (state.variation) return null;
  return goToPlyState(state, game, state.ply + 1);
}

/** Down the variation first, one move at a time, then back into the game. */
export function previousReviewState(
  state: ReviewData,
  game: ReviewGame,
): ReviewTransition | null {
  const { variation } = state;

  if (variation && variation.cursor > 1) {
    return {
      data: { variation: { ...variation, cursor: variation.cursor - 1 } },
      announce: null,
    };
  }
  if (variation) {
    return { data: { variation: null }, announce: null };
  }
  return goToPlyState(state, game, state.ply - 1);
}

/**
 * The line a move would make, or null when it is not a move this
 * position allows. Playing after walking the cursor back replaces the
 * continuation rather than branching off it.
 */
export function playVariationMove(
  state: ReviewData,
  game: ReviewGame,
  from: string,
  to: string,
): Variation | null {
  const fen = selectFen(state, game);
  const played = playMove(positionFromFen(fen).unwrap(), from, to);
  if (!played) return null;

  const kept = state.variation
    ? state.variation.moves.slice(0, state.variation.cursor)
    : [];

  return {
    moves: [...kept, { move: { from, to }, san: played.san, fen: played.fen }],
    cursor: kept.length + 1,
  };
}
