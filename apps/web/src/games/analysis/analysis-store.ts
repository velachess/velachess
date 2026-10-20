/**
 * The reactive half of browser analysis: what the review screen is showing
 * for the game it has open, held outside React so the engine can keep
 * grading while nothing is mounted.
 *
 * This file stores and notifies. It runs nothing, cancels nothing, and
 * knows nothing about Stockfish, Effection, scheduling or IndexedDB —
 * `start-analysis.ts` decides what to put here, and `analysis-db.ts`
 * decides what survives a reload.
 */
import { createStore } from "zustand/vanilla";

import type { GradedPly } from "@velachess/analysis";

type AnalysisStatus = "idle" | "analyzing" | "done" | "error";

/**
 * Immutable by contract: a change means a new snapshot with a new
 * `graded`, never an append in place. That is what lets a selector
 * compare by reference.
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

/** One game at a time, because one review screen is open at a time.
 * Whoever replaces it is replacing the analysis too. */
interface AnalysisHeld {
  /** Null before anything has been analyzed in this session. */
  readonly gameId: string | null;
  readonly snapshot: AnalysisSnapshot;
}

export const analysisStore = createStore<AnalysisHeld>(() => ({
  gameId: null,
  snapshot: IDLE_ANALYSIS,
}));

/** The same object until this game's snapshot is replaced. */
export function snapshotOf(gameId: string, held = analysisStore.getState()) {
  return held.gameId === gameId ? held.snapshot : IDLE_ANALYSIS;
}

export function setAnalysis(gameId: string, snapshot: AnalysisSnapshot): void {
  analysisStore.setState({ gameId, snapshot });
}
