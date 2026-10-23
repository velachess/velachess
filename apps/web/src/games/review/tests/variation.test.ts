import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";

import type { PositionEvaluation, WhitePovScore } from "@velachess/analysis";
import type { ReplayedMove } from "@velachess/chess";

vi.mock("../../analysis/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../analysis/index.ts")>()),
  createStockfishEvaluator: vi.fn(),
}));

import { createStockfishEvaluator } from "../../analysis/index.ts";
import type { PositionSearch } from "../../analysis/index.ts";
import {
  selectCanGoBack,
  selectCanGoForward,
  selectFen,
  selectShowingSan,
  variationFen,
} from "../review-model.ts";
import { aReplay } from "../../../test/games.ts";
import { createReviewStore, type ReviewStore } from "../review-store.ts";
import { useVariationEvaluation } from "../use-variation-evaluation.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

/** A one-move game, so there is a real ply to navigate back onto —
 * replayed by production's own `libs/chess` call. */
const moves: readonly ReplayedMove[] = aReplay("1. e4 *").moves;

/** Handed to the store once, and to every selector that needs it — the
 * replay is React Query's, never the store's. */
const game = { moves, startFen: START };

/**
 * A controllable stand-in for one position's search: streams nothing,
 * never settles until the test says so, and records whether it was
 * cancelled instead — duplicated locally per this codebase's test-helper
 * convention.
 */
function makeControllableEval(result: PositionEvaluation) {
  let settle: (value: PositionEvaluation) => void;
  let fail: (error: Error) => void;
  const engineAnswered = new Promise<PositionEvaluation>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  let cancelled = false;
  let answered = false;

  const run = vi.fn((): PositionSearch => {
    // Per search, not per helper: cancelling one must not stop the engine
    // from eventually answering the next search for the same position.
    let stop: () => void;
    const stopped = new Promise<never>((_, reject) => {
      stop = () => reject(new Error("search cancelled"));
    });
    // Handled here too: a search cancelled while it was still streaming
    // never reaches the race below.
    void stopped.catch(() => {});
    let halted = false;

    async function* search() {
      yield { depth: 4, multipv: 1, score: { cp: 0 }, pv: ["e2e4"] };
      const value = await Promise.race([engineAnswered, stopped]);
      // A cancelled search delivers nothing, even when the engine
      // answered in the same tick — which is the engine session's own
      // rule, duplicated here on purpose.
      if (halted) throw new Error("search cancelled");
      answered = true;
      return value;
    }

    return Object.assign(search(), {
      cancel: () => {
        cancelled = true;
        halted = true;
        stop();
      },
    });
  });

  return {
    run,
    answer: () => settle(result),
    reject: (error: Error) => fail(error),
    wasHalted: () => cancelled && !answered,
  };
}

/** Lets the engine's promises and React's state updates settle. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * A review with the evaluation hook mounted the way `board-evaluation.tsx`
 * mounts it: the FEN in, the number out. The reading is attached to the
 * store so a test can ask for both without threading two values around —
 * it is the screen's two sources, not a third one.
 */
type MountedReview = ReviewStore & {
  evaluation: () => WhitePovScore | null;
  closeBar: () => void;
};

function mountBar(store: ReviewStore): MountedReview {
  const bar = renderHook(() =>
    useVariationEvaluation(useStore(store, (state) => variationFen(state.variation))),
  );
  return Object.assign(store, {
    evaluation: () => bar.result.current,
    closeBar: bar.unmount,
  });
}

function openReview(): MountedReview {
  return mountBar(createReviewStore({ game }));
}

const play = (store: ReviewStore, from: string, to: string) => {
  let accepted = false;
  act(() => {
    accepted = store.getState().playMove(from, to);
  });
  return accepted;
};

/**
 * The hook owns one evaluator per review and asks it for every position,
 * so the double is split in two: `evaluate` is the search, and `dispose`
 * is the session going away.
 */
const evaluate = vi.fn<(fen: string) => PositionSearch>();
const dispose = vi.fn<() => Promise<void>>(async () => {});

beforeEach(() => {
  vi.mocked(createStockfishEvaluator).mockReturnValue({ evaluate, dispose });
});

afterEach(() => {
  vi.mocked(createStockfishEvaluator).mockReset();
  evaluate.mockReset();
  dispose.mockReset();
  dispose.mockImplementation(async () => {});
});

describe("playing a variation", () => {
  it("rejects an illegal move — nothing moves, the engine is never called", () => {
    const store = openReview();

    expect(play(store, "e2", "e5")).toBe(false);
    expect(store.getState().variation).toBeNull();
    expect(selectFen(store.getState(), game)).toBe(START);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("rejects a move by the side that is not to play", () => {
    // The rules allow it; a variation is a game being played, so the turn
    // is the turn.
    const store = openReview();

    expect(play(store, "e7", "e5")).toBe(false);
    expect(store.getState().variation).toBeNull();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("shows a legal move at once, before the engine has answered", () => {
    const pending = makeControllableEval({ score: { cp: 10 }, bestMove: "e7e5" });
    evaluate.mockImplementation(pending.run);

    const store = openReview();
    expect(play(store, "e2", "e4")).toBe(true);

    expect(selectFen(store.getState(), game)).toBe(AFTER_E4);
    expect(selectShowingSan(store.getState(), game)).toBe("e4");
    expect(store.evaluation()).toBeNull();
  });

  it("moves the bar once the engine answers, with no grade attached", async () => {
    const pending = makeControllableEval({ score: { cp: -500 }, bestMove: "d7d5" });
    evaluate.mockImplementation(pending.run);

    const store = openReview();
    play(store, "e2", "e4");
    pending.answer();
    await flush();

    expect(store.evaluation()).toEqual({ cp: -500 });
  });

  it("plays on, alternating sides by the rules", async () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: "e7e5" }).run,
    );

    const store = openReview();
    expect(play(store, "e2", "e4")).toBe(true);
    expect(play(store, "e7", "e5")).toBe(true);
    expect(play(store, "g1", "f3")).toBe(true);
    // White again, out of turn now that Black has not replied.
    expect(play(store, "b1", "c3")).toBe(false);

    const { variation } = store.getState();
    expect(variation?.moves.map((move) => move.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(variation?.cursor).toBe(3);
  });

  it("supersedes the evaluation under way, and only the last one lands", async () => {
    const first = makeControllableEval({ score: { cp: 1 }, bestMove: "e7e5" });
    const second = makeControllableEval({ score: { cp: 2 }, bestMove: "g1f3" });
    evaluate.mockImplementationOnce(first.run).mockImplementationOnce(second.run);

    const store = openReview();
    play(store, "e2", "e4");
    play(store, "e7", "e5");

    first.answer();
    second.answer();
    await flush();

    expect(first.wasHalted()).toBe(true);
    expect(store.evaluation()).toEqual({ cp: 2 });
  });

  it("walks a line faster than the engine answers, and shows only the last position's number", async () => {
    const answers = [
      makeControllableEval({ score: { cp: 1 }, bestMove: "e7e5" }),
      makeControllableEval({ score: { cp: 2 }, bestMove: "g1f3" }),
      makeControllableEval({ score: { cp: 3 }, bestMove: "b8c6" }),
    ];
    evaluate
      .mockImplementationOnce(answers[0]!.run)
      .mockImplementationOnce(answers[1]!.run)
      .mockImplementationOnce(answers[2]!.run);

    const store = openReview();
    play(store, "e2", "e4");
    play(store, "e7", "e5");
    play(store, "g1", "f3");

    // Every search answers, oldest first, after the board already moved
    // three positions on.
    for (const answer of answers) answer.answer();
    await flush();

    expect(answers[0]!.wasHalted()).toBe(true);
    expect(answers[1]!.wasHalted()).toBe(true);
    expect(store.evaluation()).toEqual({ cp: 3 });
  });

  it("drops an answer that arrives after the line left that position", async () => {
    // The window the hook used to guard with a `cancelled` flag: the
    // search settles after its own cleanup ran, with the screen still
    // mounted. The store is what refuses it.
    const first = makeControllableEval({ score: { cp: 999 }, bestMove: "e7e5" });
    const second = makeControllableEval({ score: { cp: 2 }, bestMove: "g1f3" });
    evaluate.mockImplementationOnce(first.run).mockImplementationOnce(second.run);

    const store = openReview();
    play(store, "e2", "e4");
    play(store, "e7", "e5");
    first.answer();
    await flush();

    expect(store.evaluation()).toBeNull();
  });

  it("drops an answer that arrives after the variation was left entirely", async () => {
    const pending = makeControllableEval({ score: { cp: 999 }, bestMove: "e7e5" });
    evaluate.mockImplementation(pending.run);

    const store = openReview();
    play(store, "e2", "e4");
    // Back to the real game: nothing supersedes the search, it is simply
    // about a position nobody is looking at any more.
    act(() => store.getState().goToPly(1));
    pending.answer();
    await flush();

    expect(store.getState().variation).toBeNull();
    expect(store.evaluation()).toBeNull();
  });

  it("keeps the variation when the engine fails, rather than losing the moves", async () => {
    const pending = makeControllableEval({ score: { cp: 0 }, bestMove: null });
    evaluate.mockImplementation(pending.run);

    const store = openReview();
    play(store, "e2", "e4");

    pending.reject(new Error("engine failed"));
    await flush();

    expect(selectFen(store.getState(), game)).toBe(AFTER_E4);
    expect(store.evaluation()).toBeNull();
  });
});

describe("navigating a variation", () => {
  it("blocks Next for as long as the line is on the board", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();
    play(store, "e2", "e4");

    expect(selectCanGoForward(store.getState(), game)).toBe(false);
    act(() => store.getState().next());
    expect(store.getState().ply).toBe(0);
    expect(selectFen(store.getState(), game)).toBe(AFTER_E4);
  });

  it("freezes the game's timeline: neither direction steps while a line is open", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();
    play(store, "e2", "e4");

    expect(selectCanGoBack(store.getState())).toBe(false);
    expect(selectCanGoForward(store.getState(), game)).toBe(false);

    act(() => store.getState().previous());
    act(() => store.getState().next());

    // Stepping is the game's own, and a line is not on it: nothing moved,
    // and the board is still showing the line.
    expect(store.getState().ply).toBe(0);
    expect(store.getState().variation?.moves.map((move) => move.san)).toEqual(["e4"]);
    expect(selectFen(store.getState(), game)).toBe(AFTER_E4);
  });

  it("plays on past the end of the game, where the timeline has nothing left", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();
    act(() => store.getState().goToPly(1));
    expect(selectCanGoForward(store.getState(), game)).toBe(false);

    expect(play(store, "e7", "e5")).toBe(true);
    expect(play(store, "g1", "f3")).toBe(true);

    expect(store.getState().variation?.moves.map((move) => move.san)).toEqual([
      "e5",
      "Nf3",
    ]);
  });

  it("ends the variation when a move of the real game is selected", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();
    play(store, "e2", "e4");

    act(() => store.getState().goToPly(1));

    expect(store.getState().variation).toBeNull();
    expect(store.evaluation()).toBeNull();
    expect(store.getState().ply).toBe(1);
  });

  it("hands the engine back when the screen goes away", async () => {
    const pending = makeControllableEval({ score: { cp: 0 }, bestMove: null });
    evaluate.mockImplementation(pending.run);

    const store = openReview();
    act(() => {
      store.getState().playMove("e2", "e4");
    });

    store.closeBar();
    await flush();

    expect(pending.wasHalted()).toBe(true);
  });
});

describe("the engine session a review owns", () => {
  it("opens none until a position actually needs one", () => {
    openReview();

    expect(createStockfishEvaluator).not.toHaveBeenCalled();
  });

  it("answers every position of a line on the one it opened", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();

    play(store, "e2", "e4");
    play(store, "e7", "e5");
    play(store, "g1", "f3");

    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(createStockfishEvaluator).toHaveBeenCalledTimes(1);
  });

  it("keeps it when the position changes — only the search is cancelled", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();

    play(store, "e2", "e4");
    play(store, "e7", "e5");

    expect(dispose).not.toHaveBeenCalled();
  });

  it("closes it when the review goes away", async () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();
    act(() => {
      store.getState().playMove("e2", "e4");
    });

    store.closeBar();
    await flush();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("opens a fresh one after that, rather than reaching for the closed one", async () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();
    act(() => {
      store.getState().playMove("e2", "e4");
    });
    store.closeBar();
    await flush();

    mountBar(store);
    act(() => {
      store.getState().playMove("e7", "e5");
    });

    expect(createStockfishEvaluator).toHaveBeenCalledTimes(2);
  });
});
