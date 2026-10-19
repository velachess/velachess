import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../game/analyze-game-in-browser.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));

import { aGradedPly } from "../../../test/games.ts";
import { analysisStore, IDLE_ANALYSIS } from "../analysis-store.ts";
import { resetAnalysisForTests, startAnalysis } from "../game/start-analysis.ts";
import { scriptedPasses } from "./scripted-pass.ts";

const GAME_A = { gameId: "game-a", rawPgn: "pgn-a", depth: 14 };
const GAME_B = { gameId: "game-b", rawPgn: "pgn-b", depth: 14 };

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

    expect(analysisStore.snapshotOf("game-a")).toEqual({
      status: "analyzing",
      graded: [],
      error: null,
    });
  });

  it("writes each published ply through, one at a time", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));

    passes[0]!.publish(aGradedPly(1));
    expect(analysisStore.snapshotOf("game-a").graded.map((ply) => ply.ply)).toEqual([1]);

    passes[0]!.publish(aGradedPly(2));
    expect(analysisStore.snapshotOf("game-a").graded.map((ply) => ply.ply)).toEqual([
      1, 2,
    ]);
    expect(analysisStore.snapshotOf("game-a").status).toBe("analyzing");
  });

  it("settles on done, keeping everything it graded", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));

    passes[0]!.publish(aGradedPly(1));
    passes[0]!.finish();
    await flush();

    const snapshot = analysisStore.snapshotOf("game-a");
    expect(snapshot.status).toBe("done");
    expect(snapshot.graded).toHaveLength(1);
    expect(snapshot.error).toBeNull();
  });

  it("records a real failure, keeping whatever was graded before it", async () => {
    const boom = new Error("Engine failed twice evaluating fen-a");
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));

    passes[0]!.publish(aGradedPly(1));
    passes[0]!.fail(boom);
    await flush();

    const snapshot = analysisStore.snapshotOf("game-a");
    expect(snapshot.status).toBe("error");
    expect(snapshot.error).toBe(boom);
    expect(snapshot.graded).toHaveLength(1);
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
    expect(analysisStore.snapshotOf("game-a").graded).toHaveLength(1);
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
    expect(analysisStore.snapshotOf("game-a").status).toBe("done");
  });

  it("tries again when the game is reopened after a failure", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));
    passes[0]!.fail(new Error("engine failed"));
    await flush();

    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(2));

    expect(analysisStore.snapshotOf("game-a").status).toBe("analyzing");
    expect(analysisStore.snapshotOf("game-a").error).toBeNull();
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

    expect(analysisStore.snapshotOf("game-b").status).toBe("analyzing");
    expect(analysisStore.snapshotOf("game-a")).toBe(IDLE_ANALYSIS);
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

    expect(analysisStore.snapshotOf("game-b").graded).toEqual([]);
    expect(analysisStore.snapshotOf("game-a")).toBe(IDLE_ANALYSIS);
    passes[1]!.finish();
  });

  it("does not report a replaced pass as an error", async () => {
    const passes = scriptedPasses();
    startAnalysis(GAME_A);
    await vi.waitFor(() => expect(passes).toHaveLength(1));

    startAnalysis(GAME_B);
    await vi.waitFor(() => expect(passes).toHaveLength(2));
    await flush();

    expect(analysisStore.snapshotOf("game-b").status).toBe("analyzing");
    expect(analysisStore.snapshotOf("game-b").error).toBeNull();
    passes[1]!.finish();
  });
});
