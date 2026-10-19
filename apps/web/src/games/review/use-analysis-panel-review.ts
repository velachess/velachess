/**
 * What the panel and its two interactive parts need, already decided.
 * Each is its own hook so a component subscribes to what it actually
 * uses: stepping the game must not re-render the scoresheet's rows, and
 * walking a variation must not re-render either.
 */
import {
  selectCanGoBack,
  selectCanGoForward,
  selectGameMove,
  selectTotalPlies,
} from "./review-model.ts";
import type { ReplayMove } from "./game-record.ts";
import { useGameReview } from "./use-game-review.ts";

export interface AnalysisPanelReview {
  ply: number;
  totalPlies: number;
  /** The real game's move on screen; absent at the starting position. */
  move: ReplayMove | undefined;
  /** True while a line is on the board, which is when the report's own
   * reading of this ply is about a position nobody is looking at. */
  inVariation: boolean;
  goToPly: (ply: number) => void;
  showBest: (san: string) => void;
}

export function useAnalysisPanelReview(): AnalysisPanelReview {
  return {
    ply: useGameReview((state) => state.ply),
    totalPlies: useGameReview(selectTotalPlies),
    move: useGameReview(selectGameMove),
    inVariation: useGameReview((state) => state.variation !== null),
    goToPly: useGameReview((state) => state.goToPly),
    showBest: useGameReview((state) => state.showBest),
  };
}

export interface ReplayControlsReview {
  canGoBack: boolean;
  canGoForward: boolean;
  previous: () => void;
  next: () => void;
}

export function useReplayControlsReview(): ReplayControlsReview {
  return {
    canGoBack: useGameReview(selectCanGoBack),
    canGoForward: useGameReview(selectCanGoForward),
    previous: useGameReview((state) => state.previous),
    next: useGameReview((state) => state.next),
  };
}

export interface MoveListReview {
  moves: readonly ReplayMove[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

export function useMoveListReview(): MoveListReview {
  return {
    moves: useGameReview((state) => state.moves),
    currentPly: useGameReview((state) => state.ply),
    onSelectPly: useGameReview((state) => state.goToPly),
  };
}
