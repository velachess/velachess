import { describe, expect, it, vi } from "vitest";

vi.mock("../analyze-game-in-browser.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));

import { aGradedPly } from "../../../test/games.ts";
import { analyzeGameInBrowser } from "../analyze-game-in-browser.ts";
import { EngineManager } from "../engine-manager.ts";

/**
 * A controllable stand-in for `analyzeGameInBrowser`: yields one ply, then
 * blocks until the test releases it — mirroring the real generator's own
 * shape, where the engine session only quits (and the `finally` above it
 * resolves) once the stream actually finishes, not the instant `signal`
 * fires.
 */
function makeControllableRun() {
  let finishTeardown!: () => void;
  const teardownDone = new Promise<void>((resolve) => {
    finishTeardown = resolve;
  });
  let aborted = false;

  const run = vi.fn(async function* (
    _rawPgn: string,
    _depth: number,
    signal: AbortSignal,
  ) {
    signal.addEventListener("abort", () => {
      aborted = true;
    });
    yield aGradedPly(1);
    await teardownDone;
  });

  return {
    run,
    finishTeardown: () => finishTeardown(),
    wasAborted: () => aborted,
  };
}

/**
 * A real consumer (React Query's `streamedQuery`) keeps pulling a stream's
 * generator to completion once it's started, whether or not the UI still
 * cares about the result — that continued pulling is what lets an
 * aborted run actually observe the abort and unwind. This pump stands in
 * for that, same as production.
 */
function pump<T>(gen: AsyncGenerator<T>) {
  const seen: T[] = [];
  const done = (async () => {
    for await (const value of gen) seen.push(value);
  })();
  return { seen, done };
}

describe("EngineManager.runGame", () => {
  it("cancels the previous run's signal and serializes the next run behind its teardown", async () => {
    const manager = new EngineManager();
    const first = makeControllableRun();
    vi.mocked(analyzeGameInBrowser).mockImplementation(first.run);

    const genA = manager.runGame("pgn-a", 14, new AbortController().signal);
    const runA = pump(genA);
    await vi.waitFor(() => expect(runA.seen).toHaveLength(1));

    const second = makeControllableRun();
    const genB = manager.runGame("pgn-b", 14, new AbortController().signal);
    const runB = pump(genB);

    await vi.waitFor(() => expect(first.wasAborted()).toBe(true));
    expect(analyzeGameInBrowser).toHaveBeenCalledTimes(1);

    vi.mocked(analyzeGameInBrowser).mockImplementation(second.run);
    first.finishTeardown();
    await runA.done;

    await vi.waitFor(() => expect(runB.seen).toHaveLength(1));
    expect(analyzeGameInBrowser).toHaveBeenCalledTimes(2);

    second.finishTeardown();
    await runB.done;
  });

  it("rejects once terminated", async () => {
    const manager = new EngineManager();
    manager.terminate();

    const gen = manager.runGame("pgn", 14, new AbortController().signal);
    await expect(gen.next()).rejects.toThrow(/terminated/);
  });

  it("cancel() is a no-op when nothing is running", () => {
    const manager = new EngineManager();
    expect(() => manager.cancel()).not.toThrow();
  });
});
