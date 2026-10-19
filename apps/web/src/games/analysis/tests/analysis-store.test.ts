import { describe, expect, it } from "vitest";

import { aGradedPly } from "../../../test/games.ts";
import {
  createAnalysisStore,
  IDLE_ANALYSIS,
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

describe("AnalysisStore snapshots", () => {
  it("reads idle for a game nothing was written for, as one stable object", () => {
    const store = createAnalysisStore();

    expect(store.snapshotOf("game-a")).toBe(IDLE_ANALYSIS);
    expect(store.snapshotOf("game-a")).toBe(store.snapshotOf("game-b"));
  });

  it("hands back the very object that was written, every time", () => {
    const store = createAnalysisStore();
    const snapshot = analyzing(1);

    store.set("game-a", snapshot);

    expect(store.snapshotOf("game-a")).toBe(snapshot);
    expect(store.snapshotOf("game-a")).toBe(snapshot);
  });

  it("replaces on write and leaves the snapshot it already handed out alone", () => {
    const store = createAnalysisStore();
    store.set("game-a", analyzing(1));
    const held = store.snapshotOf("game-a");

    store.set("game-a", analyzing(1, 2));

    expect(held.graded.map((ply) => ply.ply)).toEqual([1]);
    expect(store.snapshotOf("game-a").graded.map((ply) => ply.ply)).toEqual([1, 2]);
  });

  it("answers for one game at a time — writing another makes the first idle", () => {
    const store = createAnalysisStore();
    store.set("game-a", analyzing(1));

    store.set("game-b", analyzing(1, 2));

    expect(store.snapshotOf("game-b").graded).toHaveLength(2);
    expect(store.snapshotOf("game-a")).toBe(IDLE_ANALYSIS);
  });
});

describe("AnalysisStore subscriptions", () => {
  it("notifies on every write and stops once unsubscribed", () => {
    const store = createAnalysisStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications++;
    });

    store.set("game-a", analyzing(1));
    store.set("game-a", analyzing(1, 2));
    expect(notifications).toBe(2);

    unsubscribe();
    store.set("game-a", analyzing(1, 2, 3));

    expect(notifications).toBe(2);
    // Unsubscribing is not a write: the snapshot is untouched.
    expect(store.snapshotOf("game-a").graded).toHaveLength(3);
  });

  it("notifies every listener, even one that unsubscribes mid-notification", () => {
    const store = createAnalysisStore();
    const calls: string[] = [];
    const unsubscribeFirst = store.subscribe(() => {
      calls.push("first");
      unsubscribeFirst();
    });
    store.subscribe(() => calls.push("second"));

    store.set("game-a", analyzing(1));
    store.set("game-a", analyzing(1, 2));

    expect(calls).toEqual(["first", "second", "second"]);
  });

  it("subscribing on its own changes nothing", () => {
    const store = createAnalysisStore();
    store.subscribe(() => {});

    expect(store.snapshotOf("game-a")).toBe(IDLE_ANALYSIS);
  });
});
