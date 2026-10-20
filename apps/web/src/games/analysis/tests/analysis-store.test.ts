import { beforeEach, describe, expect, it } from "vitest";

import { aGradedPly } from "../../../test/games.ts";
import {
  analysisStore,
  IDLE_ANALYSIS,
  setAnalysis,
  snapshotOf,
  type AnalysisSnapshot,
} from "../analysis-store.ts";

// Nothing asynchronous here on purpose: the store stores and notifies, so
// a test for it needs no engine, no task and no scheduler. What decides
// *which* snapshot to write is `start-analysis.test.ts`.

function analyzing(...plies: number[]): AnalysisSnapshot {
  return {
    status: "analyzing",
    graded: plies.map((ply) => aGradedPly(ply)),
    error: null,
  };
}

beforeEach(() => {
  analysisStore.setState({ gameId: null, snapshot: IDLE_ANALYSIS });
});

describe("analysis snapshots", () => {
  it("reads idle for a game nothing was written for, as one stable object", () => {
    expect(snapshotOf("game-a")).toBe(IDLE_ANALYSIS);
    expect(snapshotOf("game-a")).toBe(snapshotOf("game-b"));
  });

  it("hands back the very object that was written, every time", () => {
    const snapshot = analyzing(1);

    setAnalysis("game-a", snapshot);

    expect(snapshotOf("game-a")).toBe(snapshot);
    expect(snapshotOf("game-a")).toBe(snapshot);
  });

  it("replaces on write and leaves the snapshot it already handed out alone", () => {
    setAnalysis("game-a", analyzing(1));
    const held = snapshotOf("game-a");

    setAnalysis("game-a", analyzing(1, 2));

    expect(held.graded.map((ply) => ply.ply)).toEqual([1]);
    expect(snapshotOf("game-a").graded.map((ply) => ply.ply)).toEqual([1, 2]);
  });

  it("answers for one game at a time — writing another makes the first idle", () => {
    setAnalysis("game-a", analyzing(1));

    setAnalysis("game-b", analyzing(1, 2));

    expect(snapshotOf("game-b").graded).toHaveLength(2);
    expect(snapshotOf("game-a")).toBe(IDLE_ANALYSIS);
  });

  it("notifies a reader on every write and stops once unsubscribed", () => {
    let notified = 0;
    const unsubscribe = analysisStore.subscribe(() => {
      notified++;
    });

    setAnalysis("game-a", analyzing(1));
    setAnalysis("game-a", analyzing(1, 2));
    expect(notified).toBe(2);

    unsubscribe();
    setAnalysis("game-a", analyzing(1, 2, 3));
    expect(notified).toBe(2);
  });
});
