import { act, renderHook } from "@testing-library/react";
import { ensure, withResolvers, type Operation } from "effection";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RawEval } from "@velachess/analysis";

// Partial: `explore-move.ts` grades the answer with the real
// `classifyMove`, so only the search is stubbed.
vi.mock("../../analysis/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../analysis/index.ts")>()),
  evaluatePosition: vi.fn(),
}));

import { aGradedPly } from "../../../test/games.ts";
import { evaluatePosition } from "../../analysis/index.ts";
import { useMoveExploration } from "../use-move-exploration.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * A controllable stand-in for `evaluatePosition`: never settles until
 * the test says so, and records whether it was halted
 * instead — duplicated locally per this codebase's test-helper
 * convention.
 */
function makeControllableEval(result: RawEval) {
  const engineAnswered = withResolvers<RawEval>();
  let unwound = false;
  let answered = false;

  const run = vi.fn(function* (): Operation<RawEval> {
    yield* ensure(() => {
      unwound = true;
    });
    const value = yield* engineAnswered.operation;
    answered = true;
    return value;
  });

  return {
    run,
    answer: () => engineAnswered.resolve(result),
    reject: (error: Error) => engineAnswered.reject(error),
    wasHalted: () => unwound && !answered,
  };
}

/** Lets Effection's scheduler and React's state updates settle. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  vi.mocked(evaluatePosition).mockReset();
});

describe("useMoveExploration", () => {
  it("rejects an illegal move — status stays idle, engine never called", () => {
    const grade = aGradedPly(1, { fen: START_FEN });
    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));

    let accepted = true;
    act(() => {
      accepted = result.current.tryMove("e2", "e5");
    });

    expect(accepted).toBe(false);
    expect(result.current.status).toBe("idle");
    expect(evaluatePosition).not.toHaveBeenCalled();
  });

  it("advances to evaluating immediately on a legal move, before the engine answers", () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const pending = makeControllableEval({ score: { cp: 10 }, bestMove: "e7e5" });
    vi.mocked(evaluatePosition).mockImplementation(pending.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    act(() => {
      result.current.tryMove("e2", "e4");
    });

    expect(result.current.status).toBe("evaluating");
    expect(result.current.result?.move).toEqual({ from: "e2", to: "e4" });
    expect(result.current.verdict).toBeNull();
  });

  it("resolves with a classified verdict once the engine answers", async () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const pending = makeControllableEval({ score: { cp: -500 }, bestMove: "d7d5" });
    vi.mocked(evaluatePosition).mockImplementation(pending.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    act(() => {
      result.current.tryMove("e2", "e4");
    });

    pending.answer();
    await flush();

    expect(result.current.status).toBe("resolved");
    expect(result.current.verdict?.category).toBeDefined();
  });

  it("a second tryMove halts the first — only the second's result lands", async () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const first = makeControllableEval({ score: { cp: 1 }, bestMove: "e7e5" });
    vi.mocked(evaluatePosition).mockImplementation(first.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    act(() => {
      result.current.tryMove("e2", "e4");
    });

    const second = makeControllableEval({ score: { cp: 2 }, bestMove: "d7d5" });
    vi.mocked(evaluatePosition).mockImplementation(second.run);
    act(() => {
      result.current.tryMove("d2", "d4");
    });
    await flush();

    expect(first.wasHalted()).toBe(true);

    first.answer();
    await flush();
    expect(result.current.status).toBe("evaluating");

    second.answer();
    await flush();
    expect(result.current.status).toBe("resolved");
    expect(result.current.result?.move).toEqual({ from: "d2", to: "d4" });
  });

  it("resets to idle and hands the engine back when the replay navigates away", async () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const pending = makeControllableEval({ score: { cp: 10 }, bestMove: "e7e5" });
    vi.mocked(evaluatePosition).mockImplementation(pending.run);

    const { result, rerender } = renderHook(
      ({ fen }: { fen: string }) => useMoveExploration(fen, grade),
      { initialProps: { fen: START_FEN } },
    );
    act(() => {
      result.current.tryMove("e2", "e4");
    });
    expect(result.current.status).toBe("evaluating");

    rerender({ fen: "some-other-fen" });
    await flush();

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    // Not merely out of sight: the search is stopped, so the whole-game
    // pass can take the engine back (`engine-manager.test.ts` covers the
    // resuming itself).
    expect(pending.wasHalted()).toBe(true);
  });

  it("ends the exploration when the engine fails, rather than leaving it evaluating", async () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const pending = makeControllableEval({ score: { cp: 10 }, bestMove: "e7e5" });
    vi.mocked(evaluatePosition).mockImplementation(pending.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    act(() => {
      result.current.tryMove("e2", "e4");
    });
    expect(result.current.status).toBe("evaluating");

    pending.reject(new Error("Engine failed twice evaluating fen-a"));
    await flush();

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.verdict).toBeNull();
  });

  it("releases the engine when the screen goes away", async () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const pending = makeControllableEval({ score: { cp: 10 }, bestMove: "e7e5" });
    vi.mocked(evaluatePosition).mockImplementation(pending.run);

    const { result, unmount } = renderHook(() => useMoveExploration(START_FEN, grade));
    act(() => {
      result.current.tryMove("e2", "e4");
    });

    unmount();
    await flush();

    expect(pending.wasHalted()).toBe(true);
  });

  it("exit() resets to idle and halts a pending eval", async () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const pending = makeControllableEval({ score: { cp: 10 }, bestMove: "e7e5" });
    vi.mocked(evaluatePosition).mockImplementation(pending.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    act(() => {
      result.current.tryMove("e2", "e4");
    });

    act(() => {
      result.current.exit();
    });
    await flush();

    expect(result.current.status).toBe("idle");
    expect(pending.wasHalted()).toBe(true);
  });

  it("plays the other side's piece, never marking it the engine's best move", async () => {
    // bestMove deliberately equals the opponent move's own UCI — if
    // wasEngineBest weren't gated on the mover matching the position's
    // real side to move, this would wrongly classify as "best".
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e7e5",
    });
    const pending = makeControllableEval({ score: { cp: 18 }, bestMove: "e2e4" });
    vi.mocked(evaluatePosition).mockImplementation(pending.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    let accepted = false;
    act(() => {
      accepted = result.current.tryMove("e7", "e5");
    });
    expect(accepted).toBe(true);

    pending.answer();
    await flush();

    expect(result.current.status).toBe("resolved");
    expect(result.current.verdict?.category).not.toBe("best");
  });

  it("never calls the engine when positionGrade hasn't arrived yet", () => {
    const { result } = renderHook(() => useMoveExploration(START_FEN, undefined));

    let accepted = true;
    act(() => {
      accepted = result.current.tryMove("e2", "e4");
    });

    expect(accepted).toBe(false);
    expect(evaluatePosition).not.toHaveBeenCalled();
  });
});
