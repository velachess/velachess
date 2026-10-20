import { useStore } from "zustand";

import { analysisStore, snapshotOf, type AnalysisSnapshot } from "./analysis-store.ts";

/**
 * Reads one game's analysis out of the store. Nothing is copied into
 * component state: the store owns the snapshot, and both it and
 * `IDLE_ANALYSIS` are stable references, so a render only happens when
 * this game's snapshot is actually replaced.
 */
export function useEngineAnalysis(gameId: string): AnalysisSnapshot {
  return useStore(analysisStore, (held) => snapshotOf(gameId, held));
}
