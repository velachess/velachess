import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RawEval } from "@velachess/analysis";

vi.mock("../../browser-analysis/index.ts", () => ({
  engineManager: { evaluatePosition: vi.fn() },
}));

import { aGradedPly } from "../../../test/games.ts";
import { engineManager } from "../../browser-analysis/index.ts";
import { useMoveExploration } from "../use-move-exploration.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * A controllable stand-in for `engineManager.evaluatePosition`: never
 * resolves until the test says so, and records whether its signal was
 * aborted — same reasoning as `engine-manager.test.ts`'s own
 * `makeControllableEval`, duplicated locally per this codebase's
 * test-helper convention.
 */
function makeControllableEval(result: RawEval) {
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

  return { run, answer: () => resolveEval(), wasAborted: () => aborted };
}

afterEach(() => {
  vi.mocked(engineManager.evaluatePosition).mockReset();
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
    expect(engineManager.evaluatePosition).not.toHaveBeenCalled();
  });

  it("advances to evaluating immediately on a legal move, before the engine answers", () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const pending = makeControllableEval({ score: { cp: 10 }, bestMove: "e7e5" });
    vi.mocked(engineManager.evaluatePosition).mockImplementation(pending.run);

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
    vi.mocked(engineManager.evaluatePosition).mockImplementation(pending.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    act(() => {
      result.current.tryMove("e2", "e4");
    });

    await act(async () => {
      pending.answer();
      await Promise.resolve();
    });

    expect(result.current.status).toBe("resolved");
    expect(result.current.verdict?.category).toBeDefined();
  });

  it("a second tryMove aborts the first — only the second's result lands", async () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const first = makeControllableEval({ score: { cp: 1 }, bestMove: "e7e5" });
    vi.mocked(engineManager.evaluatePosition).mockImplementation(first.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    act(() => {
      result.current.tryMove("e2", "e4");
    });

    const second = makeControllableEval({ score: { cp: 2 }, bestMove: "d7d5" });
    vi.mocked(engineManager.evaluatePosition).mockImplementation(second.run);
    act(() => {
      result.current.tryMove("d2", "d4");
    });

    expect(first.wasAborted()).toBe(true);

    await act(async () => {
      first.answer();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("evaluating");

    await act(async () => {
      second.answer();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("resolved");
    expect(result.current.result?.move).toEqual({ from: "d2", to: "d4" });
  });

  it("resets to idle when the real replay navigates to a different fen", () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const pending = makeControllableEval({ score: { cp: 10 }, bestMove: "e7e5" });
    vi.mocked(engineManager.evaluatePosition).mockImplementation(pending.run);

    const { result, rerender } = renderHook(
      ({ fen }: { fen: string }) => useMoveExploration(fen, grade),
      { initialProps: { fen: START_FEN } },
    );
    act(() => {
      result.current.tryMove("e2", "e4");
    });
    expect(result.current.status).toBe("evaluating");

    rerender({ fen: "some-other-fen" });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
  });

  it("exit() resets to idle and aborts a pending eval", () => {
    const grade = aGradedPly(1, {
      fen: START_FEN,
      evalBefore: { cp: 20 },
      bestMove: "e2e4",
    });
    const pending = makeControllableEval({ score: { cp: 10 }, bestMove: "e7e5" });
    vi.mocked(engineManager.evaluatePosition).mockImplementation(pending.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    act(() => {
      result.current.tryMove("e2", "e4");
    });

    act(() => {
      result.current.exit();
    });

    expect(result.current.status).toBe("idle");
    expect(pending.wasAborted()).toBe(true);
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
    vi.mocked(engineManager.evaluatePosition).mockImplementation(pending.run);

    const { result } = renderHook(() => useMoveExploration(START_FEN, grade));
    let accepted = false;
    act(() => {
      accepted = result.current.tryMove("e7", "e5");
    });
    expect(accepted).toBe(true);

    await act(async () => {
      pending.answer();
      await Promise.resolve();
    });

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
    expect(engineManager.evaluatePosition).not.toHaveBeenCalled();
  });
});
