/**
 * One review instance's state, and every synchronous transition over it:
 * where in the game we are, the variation being tried out, and the
 * evaluation that came back for it.
 *
 * This file runs nothing. It does not know about Effection, the Worker or
 * the scheduler — `use-variation-evaluation.ts` asks the engine and hands
 * the answer back through `variationEvaluated`, and `EngineManager`
 * decides when the engine is free.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import type { MoveSquares } from "@velachess/chess";
import {
  playMove as playChessMove,
  positionFromFen,
  sideToMoveOf,
} from "@velachess/chess";

import type { GradedPly } from "../analysis/index.ts";
import { fenAtPly, type ReplayMove } from "./game-record.ts";

export const REPLAY_NAVIGATION = {
  START: "start",
  MOVE: "move",
} as const;

export type ReplayNavigationEvent =
  | { type: typeof REPLAY_NAVIGATION.START }
  | { type: typeof REPLAY_NAVIGATION.MOVE; move: ReplayMove };

export type ReplayNavigation = (event: ReplayNavigationEvent) => void;

/** All a review needs of the game it is a review of. */
export interface ReviewGame {
  moves: readonly ReplayMove[];
  startFen: string;
}

/** One half-move of a variation, carrying the position it produced. */
export interface VariationMove {
  move: MoveSquares;
  san: string;
  fen: string;
}

/** A line tried out from one ply of the real game. One line, not a tree. */
export interface Variation {
  originPly: number;
  moves: VariationMove[];
  /** 1-based: how many of the line's moves are on the board. Never 0 — a
   * variation with nothing shown is the game itself. */
  cursor: number;
}

export interface ReviewState {
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
  variationEvaluation: { fen: string; score: GradedPly["evalAfter"] } | null;
  /** The engine's move someone asked to see, as SAN. */
  preview: string | null;

  goToPly: (ply: number) => void;
  next: () => void;
  previous: () => void;
  playMove: (from: string, to: string) => boolean;
  variationEvaluated: (fen: string, score: GradedPly["evalAfter"]) => void;
  showBest: (san: string) => void;
}

export type ReviewStore = StoreApi<ReviewState>;

/** The variation's own position, when one is open. */
export function variationFen(variation: Variation | null): string | null {
  if (!variation) return null;
  return variation.moves[variation.cursor - 1]?.fen ?? null;
}

/** The position on the board: the variation's when one is open, the game's otherwise. */
export function selectFen(state: ReviewState): string {
  return (
    variationFen(state.variation) ?? fenAtPly(state.moves, state.startFen, state.ply)
  );
}

export function selectTotalPlies(state: ReviewState): number {
  return state.moves.length;
}

/**
 * Previous doubles as the way out of a variation — there is no exit
 * button, just the line to walk back down. Exploring from the very first
 * position has no real move behind it, so the variation itself is what
 * keeps Previous available.
 */
export function selectCanGoBack(state: ReviewState): boolean {
  return state.ply > 0 || state.variation !== null;
}

export function selectCanGoForward(state: ReviewState): boolean {
  return state.variation === null && state.ply < state.moves.length;
}

/** The move the board is showing, by its notation. */
export function selectShowingSan(state: ReviewState): string | null {
  const { variation } = state;
  if (variation) return variation.moves[variation.cursor - 1]?.san ?? null;
  return state.moves[state.ply - 1]?.san ?? null;
}

export function selectLastMove(state: ReviewState): MoveSquares | null {
  const { variation } = state;
  if (!variation) return null;
  return variation.moves[variation.cursor - 1]?.move ?? null;
}

export function createReviewStore({
  game,
  onNavigate,
}: {
  game: ReviewGame;
  onNavigate?: ReplayNavigation | undefined;
}): ReviewStore {
  return createStore<ReviewState>((set, get) => ({
    moves: game.moves,
    startFen: game.startFen,
    ply: 0,
    variation: null,
    variationEvaluation: null,
    preview: null,

    goToPly(target: number): void {
      const { ply, variation, moves } = get();
      const next = Math.min(Math.max(target, 0), moves.length);
      if (next === ply && variation === null) return;

      set({ ply: next, variation: null, variationEvaluation: null, preview: null });
      if (next === ply) return;

      const move = moves[next - 1];
      onNavigate?.(
        move ? { type: REPLAY_NAVIGATION.MOVE, move } : { type: REPLAY_NAVIGATION.START },
      );
    },

    next(): void {
      const { variation, ply, goToPly } = get();
      if (variation) return;
      goToPly(ply + 1);
    },

    previous(): void {
      const { variation, ply, goToPly } = get();
      if (variation && variation.cursor > 1) {
        set({ variation: { ...variation, cursor: variation.cursor - 1 } });
        return;
      }
      if (variation) {
        set({ variation: null, variationEvaluation: null });
        return;
      }
      goToPly(ply - 1);
    },

    playMove(from: string, to: string): boolean {
      const state = get();
      const fen = selectFen(state);
      const played = playChessMove(positionFromFen(fen).unwrap(), from, to);
      // The rules allow moving either side's piece from a given position;
      // a variation is a game being played, so it is the turn's to move.
      if (!played || played.mover !== sideToMoveOf(fen)) return false;

      const { variation } = state;
      const line = variation ? variation.moves.slice(0, variation.cursor) : [];
      line.push({ move: { from, to }, san: played.san, fen: played.fen });

      set({
        variation: {
          originPly: variation?.originPly ?? state.ply,
          moves: line,
          cursor: line.length,
        },
      });
      return true;
    },

    variationEvaluated(fen: string, score: GradedPly["evalAfter"]): void {
      // An answer is only about the position it was asked for. The board
      // may have moved on while the engine searched, and a number from a
      // position nobody is looking at is not this position's evaluation.
      if (variationFen(get().variation) !== fen) return;
      set({ variationEvaluation: { fen, score } });
    },

    showBest(san: string): void {
      set({ preview: san });
    },
  }));
}
