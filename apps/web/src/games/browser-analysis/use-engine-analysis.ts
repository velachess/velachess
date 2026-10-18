import { useCallback, useSyncExternalStore } from "react";

import { analysisStore, IDLE_ANALYSIS, type AnalysisSnapshot } from "./analysis-store.ts";

/**
 * Reads one game's analysis out of the store. Nothing is copied into
 * component state: the store owns the snapshot, and
 * `useSyncExternalStore` re-renders on the reference changing.
 */
export function useEngineAnalysis(gameId: string): AnalysisSnapshot {
  const getSnapshot = useCallback(() => analysisStore.snapshotOf(gameId), [gameId]);

  // The store is empty while prerendering — no Worker, nothing started —
  // so the server snapshot is the idle one by definition.
  return useSyncExternalStore(analysisStore.subscribe, getSnapshot, () => IDLE_ANALYSIS);
}
