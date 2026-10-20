import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../analyze-game-in-browser.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));

import { aGradedPly } from "../../../test/games.ts";
import { resetAnalysisForTests, startAnalysis } from "../start-analysis.ts";
import { useEngineAnalysis } from "../use-engine-analysis.ts";
import { scriptedPasses } from "./scripted-pass.ts";

/**
 * Exercises the real store and the real coordinator, with only the
 * engine scripted — the point of these tests is the React
 * subscription, which a hand-made store would not prove.
 */
function renderAnalysis(gameId: string) {
  let renders = 0;
  const view = renderHook(
    ({ id }: { id: string }) => {
      renders++;
      return useEngineAnalysis(id);
    },
    { initialProps: { id: gameId } },
  );
  return { ...view, renderCount: () => renders };
}

beforeEach(() => {
  resetAnalysisForTests();
});

function start(gameId: string) {
  act(() => {
    startAnalysis({ gameId, rawPgn: "pgn" });
  });
}

describe("useEngineAnalysis", () => {
  it("reads idle for a game nothing was started for", () => {
    const { result } = renderAnalysis("hook-idle");

    expect(result.current.status).toBe("idle");
    expect(result.current.graded).toEqual([]);
  });

  it("re-renders once per published ply, with the graded list growing", async () => {
    const passes = scriptedPasses();
    const { result, renderCount } = renderAnalysis("hook-progress");

    start("hook-progress");
    await vi.waitFor(() => expect(passes).toHaveLength(1));
    const beforePlies = renderCount();

    act(() => passes[0]!.publish(aGradedPly(1)));
    expect(result.current.graded.map((ply) => ply.ply)).toEqual([1]);

    act(() => passes[0]!.publish(aGradedPly(2)));
    expect(result.current.graded.map((ply) => ply.ply)).toEqual([1, 2]);

    // One render per ply — the snapshot is stable otherwise, so nothing
    // re-renders on a notification that changed nothing for this game.
    expect(renderCount() - beforePlies).toBe(2);
    expect(result.current.status).toBe("analyzing");

    act(() => passes[0]!.finish());
    await vi.waitFor(() => expect(result.current.status).toBe("done"));
  });

  it("reads idle again when pointed at a different game", async () => {
    const passes = scriptedPasses();
    const { result, rerender } = renderAnalysis("hook-switch-a");

    start("hook-switch-a");
    await vi.waitFor(() => expect(passes).toHaveLength(1));
    act(() => passes[0]!.publish(aGradedPly(1)));
    expect(result.current.graded).toHaveLength(1);

    rerender({ id: "hook-switch-b" });
    expect(result.current.status).toBe("idle");
    expect(result.current.graded).toEqual([]);

    rerender({ id: "hook-switch-a" });
    expect(result.current.graded).toHaveLength(1);

    act(() => passes[0]!.finish());
  });

  it("unmounting stops the subscription without stopping the analysis", async () => {
    const passes = scriptedPasses();
    const first = renderAnalysis("hook-unmount");

    start("hook-unmount");
    await vi.waitFor(() => expect(passes).toHaveLength(1));
    act(() => passes[0]!.publish(aGradedPly(1)));
    expect(first.result.current.graded).toHaveLength(1);

    first.unmount();
    // Still grading with nothing mounted — this is what "closing the last
    // screen does not cancel" looks like from React's side.
    passes[0]!.publish(aGradedPly(2));

    const second = renderAnalysis("hook-unmount");
    expect(second.result.current.graded.map((ply) => ply.ply)).toEqual([1, 2]);
    expect(second.result.current.status).toBe("analyzing");

    act(() => passes[0]!.finish());
    await vi.waitFor(() => expect(second.result.current.status).toBe("done"));
  });
});
