/**
 * The reactive half of browser analysis: what the review screen is showing
 * for the game it has open, held outside React so the engine can keep
 * grading while nothing is mounted.
 *
 * This file stores and notifies. It runs nothing, cancels nothing, and
 * knows nothing about Stockfish, Effection, scheduling or IndexedDB —
 * `start-analysis.ts` decides what to put here, `engine-manager.ts`
 * decides when the engine is free, and the caches decide what survives a
 * reload.
 */
import type { GradedPly } from "@velachess/analysis";

type AnalysisStatus = "idle" | "analyzing" | "done" | "error";

/**
 * Immutable by contract: a change means a new snapshot with a new
 * `graded`, never an append in place. That is what lets
 * `useSyncExternalStore` compare by reference.
 */
export interface AnalysisSnapshot {
  readonly status: AnalysisStatus;
  readonly graded: readonly GradedPly[];
  /** Why the analysis stopped, when `status` is `"error"`. */
  readonly error: Error | null;
}

export const IDLE_ANALYSIS: AnalysisSnapshot = {
  status: "idle",
  graded: [],
  error: null,
};

export interface AnalysisStore {
  /** Returns its own unsubscribe. Subscribing neither starts nor stops an
   * analysis — a listener is a reader, not an owner. */
  subscribe(listener: () => void): () => void;
  /** The same object until this game's snapshot is replaced. */
  snapshotOf(gameId: string): AnalysisSnapshot;
  set(gameId: string, snapshot: AnalysisSnapshot): void;
}

export function createAnalysisStore(): AnalysisStore {
  const listeners = new Set<() => void>();
  // One game at a time, because one review screen is open at a time.
  // Whoever replaces it is replacing the analysis too.
  let held: { gameId: string; snapshot: AnalysisSnapshot } | null = null;

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    snapshotOf(gameId: string): AnalysisSnapshot {
      return held?.gameId === gameId ? held.snapshot : IDLE_ANALYSIS;
    },

    set(gameId: string, snapshot: AnalysisSnapshot): void {
      held = { gameId, snapshot };
      // A listener that unsubscribes itself here has already been called;
      // one that unsubscribes another is asking for it to be skipped.
      for (const listener of listeners) listener();
    },
  };
}

export const analysisStore = createAnalysisStore();
