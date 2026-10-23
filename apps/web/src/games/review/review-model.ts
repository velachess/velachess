/**
 * Pure: a transition answers what would change, and the store applies it.
 */
import type { MoveSquares } from "@velachess/chess";
import { playMove, positionFromFen, type ReplayedMove } from "@velachess/chess";

import type { GradedPly } from "../analysis/index.ts";
import { fenAtPly } from "./game-record.ts";

/** Checked rather than trusted, so a mismatch reads as ungraded instead of
 * handing back another move's grade. */
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

/** A parameter, never state: the replay belongs to `gameQuery`. */
export interface ReviewGame {
  moves: readonly ReplayedMove[];
  startFen: string;
}

interface VariationMove {
  move: MoveSquares;
  san: string;
  fen: string;
}

/** One line from one ply of the real game, not a tree. */
export interface Variation {
  moves: VariationMove[];
  /** How many of the line's moves are on the board; never 0. */
  cursor: number;
}

export interface ReviewData {
  /** 0 is the position before anyone moved. */
  ply: number;
  variation: Variation | null;
  /** The asking only: the move itself is the report's. */
  showBestMove: boolean;
}

export interface ReviewTransition {
  data: Partial<ReviewData>;
  announce: ReplayNavigationEvent | null;
}

export const INITIAL_REVIEW: ReviewData = {
  ply: 0,
  variation: null,
  showBestMove: false,
};

export function variationFen(variation: Variation | null): string | null {
  if (!variation) return null;
  return variation.moves[variation.cursor - 1]?.fen ?? null;
}

export function selectFen(state: ReviewData, game: ReviewGame): string {
  return variationFen(state.variation) ?? fenAtPly(game.moves, game.startFen, state.ply);
}

/** A variation freezes the game's timeline, and the way back is the
 * scoresheet. */
export function selectCanGoBack(state: ReviewData): boolean {
  return state.variation === null && state.ply > 0;
}

export function selectCanGoForward(state: ReviewData, game: ReviewGame): boolean {
  return state.variation === null && state.ply < game.moves.length;
}

export function selectGameMove(
  state: ReviewData,
  game: ReviewGame,
): ReplayedMove | undefined {
  return game.moves[state.ply - 1];
}

export function selectVariationMove(state: ReviewData): MoveSquares | null {
  const { variation } = state;
  if (!variation) return null;
  return variation.moves[variation.cursor - 1]?.move ?? null;
}

export function selectShowingSan(state: ReviewData, game: ReviewGame): string | null {
  const { variation } = state;
  if (variation) return variation.moves[variation.cursor - 1]?.san ?? null;
  return selectGameMove(state, game)?.san ?? null;
}

/** Null when nothing would change: a jump onto the ply on screen, with no
 * variation to leave, is not navigation. */
export function goToPlyState(
  state: ReviewData,
  game: ReviewGame,
  target: number,
): ReviewTransition | null {
  const ply = Math.min(Math.max(target, 0), game.moves.length);
  if (ply === state.ply && state.variation === null) return null;

  const data = { ply, variation: null, showBestMove: false };
  if (ply === state.ply) return { data, announce: null };

  const move = game.moves[ply - 1];
  return {
    data,
    announce: move
      ? { type: REPLAY_NAVIGATION.MOVE, move }
      : { type: REPLAY_NAVIGATION.START },
  };
}

export function nextReviewState(
  state: ReviewData,
  game: ReviewGame,
): ReviewTransition | null {
  if (state.variation) return null;
  return goToPlyState(state, game, state.ply + 1);
}

export function previousReviewState(
  state: ReviewData,
  game: ReviewGame,
): ReviewTransition | null {
  if (state.variation) return null;
  return goToPlyState(state, game, state.ply - 1);
}

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
