import { describe, expect, it, vi } from "vitest";

import type { RawEval } from "@velachess/analysis";

vi.mock("../analyze-game-in-browser.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));
vi.mock("../evaluate-position-in-browser.ts", () => ({
  evaluatePositionInBrowser: vi.fn(),
}));

import { aGradedPly } from "../../../test/games.ts";
import { analyzeGameInBrowser } from "../analyze-game-in-browser.ts";
import { evaluatePositionInBrowser } from "../evaluate-position-in-browser.ts";
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
    _gameId: string,
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

const A_RAW_EVAL: RawEval = { score: { cp: 10 }, bestMove: "e2e4" };

/**
 * A controllable stand-in for `evaluatePositionInBrowser`: never resolves
 * until the test says so, same reasoning as `makeControllableRun` above —
 * a real abort only hurries the in-flight search, it doesn't make the
 * call return before the engine actually answers.
 */
function makeControllableEval(result: RawEval = A_RAW_EVAL) {
  let resolveEval!: () => void;
  const engineAnswered = new Promise<void>((resolve) => {
    resolveEval = resolve;
  });
  let aborted = false;

  const run = vi.fn(async (_fen: string, _depth: number, signal: AbortSignal) => {
    signal.addEventListener("abort", () => {
      aborted = true;
    });
    await engineAnswered;
    return result;
  });

  return {
    run,
    answer: () => resolveEval(),
    wasAborted: () => aborted,
  };
}

describe("EngineManager.runGame", () => {
  it("cancels the previous run's signal and serializes the next run behind its teardown", async () => {
    const manager = new EngineManager();
    const first = makeControllableRun();
    vi.mocked(analyzeGameInBrowser).mockImplementation(first.run);

    const genA = manager.runGame("game-a", "pgn-a", 14, new AbortController().signal);
    const runA = pump(genA);
    await vi.waitFor(() => expect(runA.seen).toHaveLength(1));

    const second = makeControllableRun();
    const genB = manager.runGame("game-b", "pgn-b", 14, new AbortController().signal);
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

    const gen = manager.runGame("game-x", "pgn", 14, new AbortController().signal);
    await expect(gen.next()).rejects.toThrow(/terminated/);
  });

  it("cancel() is a no-op when nothing is running", () => {
    const manager = new EngineManager();
    expect(() => manager.cancel()).not.toThrow();
  });
});

describe("EngineManager.evaluatePosition", () => {
  it("a second call preempts the first — the stale result resolves to undefined", async () => {
    const manager = new EngineManager();
    const first = makeControllableEval({ score: { cp: 1 }, bestMove: "e2e4" });
    vi.mocked(evaluatePositionInBrowser).mockImplementation(first.run);

    const resultA = manager.evaluatePosition("fen-a", 14, new AbortController().signal);
    await vi.waitFor(() => expect(evaluatePositionInBrowser).toHaveBeenCalledTimes(1));

    const second = makeControllableEval({ score: { cp: 2 }, bestMove: "d2d4" });
    vi.mocked(evaluatePositionInBrowser).mockImplementation(second.run);
    const resultB = manager.evaluatePosition("fen-b", 14, new AbortController().signal);

    await vi.waitFor(() => expect(first.wasAborted()).toBe(true));
    first.answer();
    expect(await resultA).toBeUndefined();

    await vi.waitFor(() => expect(second.run).toHaveBeenCalledTimes(1));
    second.answer();
    expect(await resultB).toEqual({ score: { cp: 2 }, bestMove: "d2d4" });
  });

  it("rejects once terminated", async () => {
    const manager = new EngineManager();
    manager.terminate();

    await expect(
      manager.evaluatePosition("fen-a", 14, new AbortController().signal),
    ).rejects.toThrow(/terminated/);
  });
});

describe("EngineManager cross-lane priority", () => {
  it("evaluatePosition preempts an active runGame", async () => {
    const manager = new EngineManager();
    const background = makeControllableRun();
    vi.mocked(analyzeGameInBrowser).mockImplementation(background.run);

    const gen = manager.runGame("game-a", "pgn-a", 14, new AbortController().signal);
    const run = pump(gen);
    await vi.waitFor(() => expect(run.seen).toHaveLength(1));

    const interactive = makeControllableEval();
    vi.mocked(evaluatePositionInBrowser).mockImplementation(interactive.run);
    const result = manager.evaluatePosition("fen-a", 14, new AbortController().signal);

    await vi.waitFor(() => expect(background.wasAborted()).toBe(true));
    background.finishTeardown();
    await run.done;

    await vi.waitFor(() => expect(interactive.run).toHaveBeenCalledTimes(1));
    interactive.answer();
    expect(await result).toEqual(A_RAW_EVAL);
  });

  it("runGame queues behind an active evaluatePosition instead of preempting it", async () => {
    const manager = new EngineManager();
    const interactive = makeControllableEval();
    vi.mocked(evaluatePositionInBrowser).mockImplementation(interactive.run);

    const result = manager.evaluatePosition("fen-a", 14, new AbortController().signal);
    await vi.waitFor(() => expect(interactive.run).toHaveBeenCalledTimes(1));

    const background = makeControllableRun();
    vi.mocked(analyzeGameInBrowser).mockImplementation(background.run);
    const gen = manager.runGame("game-a", "pgn-a", 14, new AbortController().signal);
    const run = pump(gen);

    // Give the event loop a turn — runGame must still be waiting, not
    // having started analyzeGameInBrowser (and not having aborted the
    // interactive call).
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(interactive.wasAborted()).toBe(false);
    expect(analyzeGameInBrowser).not.toHaveBeenCalled();

    interactive.answer();
    expect(await result).toEqual(A_RAW_EVAL);

    await vi.waitFor(() => expect(run.seen).toHaveLength(1));
    background.finishTeardown();
    await run.done;
  });
});
