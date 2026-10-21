import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../analyze-game-in-browser.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));

import { aGradedPly, aReplay } from "../../../test/games.ts";
import { IDLE_ANALYSIS, snapshotOf } from "../analysis-store.ts";
import { resetAnalysisForTests, startAnalysis } from "../start-analysis.ts";
import { scriptedPasses } from "./scripted-pass.ts";

const GAME_A = { gameId: "game-a", replay: aReplay() };
const GAME_B = { gameId: "game-b", replay: aReplay() };

beforeEach(() => {
  resetAnalysisForTests();
});

/** Lets the Effection scheduler and the promise callbacks settle. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("startAnalysis progress", () => {
  it("marks the game as analyzing before the engine has said anything", () => {
    scriptedPasses();

    startAnalysis(GAME_A);

    expect(snapshotOf("game-a")).toEqual({ status: "analyzing", graded: [] });
  });

  it("writes each published ply through, one at a time", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));

    passes[0]!.publish(aGradedPly(1));
    expect(snapshotOf("game-a").graded.map((ply) => ply.ply)).toEqual([1]);

    passes[0]!.publish(aGradedPly(2));
    expect(snapshotOf("game-a").graded.map((ply) => ply.ply)).toEqual([1, 2]);
    expect(snapshotOf("game-a").status).toBe("analyzing");
  });

  it("settles on done, keeping everything it graded", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));

    passes[0]!.publish(aGradedPly(1));
    passes[0]!.finish();
    await flush();

    const snapshot = snapshotOf("game-a");
    expect(snapshot.status).toBe("done");
    expect(snapshot.graded).toHaveLength(1);
  });

  it("records a real failure, keeping whatever was graded before it", async () => {
    const boom = new Error("Engine failed twice evaluating fen-a");
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));

    passes[0]!.publish(aGradedPly(1));
    passes[0]!.fail(boom);
    await flush();

    const snapshot = snapshotOf("game-a");
    expect(snapshot.status).toBe("error");
    expect(snapshot.graded).toHaveLength(1);
    // The cause is not in the snapshot — nothing reads it there — but it
    // must not be swallowed either.
    expect(reported).toHaveBeenCalledWith("Browser analysis failed", boom);
    reported.mockRestore();
  });
});

describe("startAnalysis deduplication", () => {
  it("picks up a pass already under way instead of starting a second one", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));
    passes[0]!.publish(aGradedPly(1));

    startAnalysis(GAME_A);
    await flush();

    expect(passes).toHaveLength(1);
    expect(snapshotOf("game-a").graded).toHaveLength(1);
  });

  it("does not re-analyze a game that already finished", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));
    passes[0]!.finish();
    await flush();

    startAnalysis(GAME_A);
    await flush();

    expect(passes).toHaveLength(1);
    expect(snapshotOf("game-a").status).toBe("done");
  });

  it("tries again when the game is reopened after a failure", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));
    passes[0]!.fail(new Error("engine failed"));
    await flush();

    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(2));

    expect(snapshotOf("game-a").status).toBe("analyzing");
    passes[1]!.finish();
  });
});

describe("startAnalysis replacement", () => {
  it("replaces the pass under way when a different game is opened", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));
    passes[0]!.publish(aGradedPly(1));

    startAnalysis(GAME_B);
    await vi.waitFor(() => expect(passes[0]!.wasHalted()).toBe(true));
    await vi.waitFor(() => expect(passes).toHaveLength(2));

    expect(snapshotOf("game-b").status).toBe("analyzing");
    expect(snapshotOf("game-a")).toBe(IDLE_ANALYSIS);
    passes[1]!.finish();
  });

  it("refuses a ply from a pass that was already replaced", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));

    startAnalysis(GAME_B);
    await vi.waitFor(() => expect(passes).toHaveLength(2));

    // The halted pass still holds a live `publish` reference; a ply
    // decided in the same tick must not land in game B's snapshot.
    passes[0]!.publish(aGradedPly(1));

    expect(snapshotOf("game-b").graded).toEqual([]);
    expect(snapshotOf("game-a")).toBe(IDLE_ANALYSIS);
    passes[1]!.finish();
  });

  it("does not report a replaced pass as an error", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));

    startAnalysis(GAME_B);
    await vi.waitFor(() => expect(passes).toHaveLength(2));
    await flush();

    expect(snapshotOf("game-b").status).toBe("analyzing");
    passes[1]!.finish();
  });
});
