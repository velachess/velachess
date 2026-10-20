import { act, renderHook } from "@testing-library/react";
import { call, ensure, withResolvers, type Operation } from "effection";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PositionEvaluation } from "@velachess/analysis";

vi.mock("../../analysis/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../analysis/index.ts")>()),
  openPositionEvaluator: vi.fn(),
}));

import { openPositionEvaluator } from "../../analysis/index.ts";
import type { ReplayMove } from "../game-record.ts";
import {
  selectCanGoBack,
  selectCanGoForward,
  selectFen,
  selectShowingSan,
} from "../review-model.ts";
import { createReviewStore, type ReviewStore } from "../review-store.ts";
import { useVariationEvaluation } from "../use-variation-evaluation.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

/** A one-move game, so there is a real ply to navigate back onto. */
const moves: ReplayMove[] = [{ ply: 1, san: "e4", fenBefore: START, fenAfter: AFTER_E4 }];

/**
 * A controllable stand-in for `evaluatePosition`: never settles until the
 * test says so, and records whether it was halted instead — duplicated
 * locally per this codebase's test-helper convention.
 */
function makeControllableEval(result: PositionEvaluation) {
  const engineAnswered = withResolvers<PositionEvaluation>();
  let unwound = false;
  let answered = false;

  const run = vi.fn(function* (): Operation<PositionEvaluation> {
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

function openReview(): ReviewStore {
  const store = createReviewStore({ game: { moves, startFen: START } });
  renderHook(() => useVariationEvaluation(store));
  return store;
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
const evaluate = vi.fn<(fen: string) => Operation<PositionEvaluation>>();
const dispose = vi.fn<() => Operation<void>>(() => call(() => undefined));

beforeEach(() => {
  vi.mocked(openPositionEvaluator).mockReturnValue({ evaluate, dispose });
});

afterEach(() => {
  vi.mocked(openPositionEvaluator).mockReset();
  evaluate.mockReset();
  dispose.mockReset();
  dispose.mockImplementation(() => call(() => undefined));
});

describe("playing a variation", () => {
  it("rejects an illegal move — nothing moves, the engine is never called", () => {
    const store = openReview();

    expect(play(store, "e2", "e5")).toBe(false);
    expect(store.getState().variation).toBeNull();
    expect(selectFen(store.getState())).toBe(START);
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

    expect(selectFen(store.getState())).toBe(AFTER_E4);
    expect(selectShowingSan(store.getState())).toBe("e4");
    expect(store.getState().variationEvaluation).toBeNull();
  });

  it("moves the bar once the engine answers, with no grade attached", async () => {
    const pending = makeControllableEval({ score: { cp: -500 }, bestMove: "d7d5" });
    evaluate.mockImplementation(pending.run);

    const store = openReview();
    play(store, "e2", "e4");
    pending.answer();
    await flush();

    expect(store.getState().variationEvaluation).toEqual({ cp: -500 });
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
    expect(variation?.originPly).toBe(0);
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
    expect(store.getState().variationEvaluation).toEqual({ cp: 2 });
  });

  it("refuses an answer about a position that is no longer on the board", async () => {
    const pending = makeControllableEval({ score: { cp: 999 }, bestMove: "e7e5" });
    evaluate.mockImplementation(pending.run);

    const store = openReview();
    play(store, "e2", "e4");

    // Straight past the hook, as a result resolving in the same tick the
    // board moved would: the store is the one that decides.
    act(() => {
      store.getState().variationEvaluated("some other position", { cp: 999 });
    });

    expect(store.getState().variationEvaluation).toBeNull();
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

    expect(store.getState().variationEvaluation).toBeNull();
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
    expect(store.getState().variationEvaluation).toBeNull();
  });

  it("re-asks for the position the line walked back onto, ignoring the halted search", async () => {
    // A -> B -> A. The first search was halted when the line moved on, so
    // it never delivers even though the engine eventually answers it; the
    // number on screen comes from the search the walk back started.
    const first = makeControllableEval({ score: { cp: 999 }, bestMove: "e7e5" });
    const rest = makeControllableEval({ score: { cp: 1 }, bestMove: "e7e5" });
    evaluate.mockImplementationOnce(first.run).mockImplementation(rest.run);

    const store = openReview();
    play(store, "e2", "e4");
    play(store, "e7", "e5");
    act(() => store.getState().previous());
    expect(selectFen(store.getState())).toBe(AFTER_E4);

    first.answer();
    await flush();
    expect(first.wasHalted()).toBe(true);
    expect(store.getState().variationEvaluation).toBeNull();

    rest.answer();
    await flush();
    expect(store.getState().variationEvaluation).toEqual({ cp: 1 });
  });

  it("keeps the variation when the engine fails, rather than losing the moves", async () => {
    const pending = makeControllableEval({ score: { cp: 0 }, bestMove: null });
    evaluate.mockImplementation(pending.run);

    const store = openReview();
    play(store, "e2", "e4");

    pending.reject(new Error("engine failed"));
    await flush();

    expect(selectFen(store.getState())).toBe(AFTER_E4);
    expect(store.getState().variationEvaluation).toBeNull();
  });
});

describe("navigating a variation", () => {
  it("blocks Next for as long as the line is on the board", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();
    play(store, "e2", "e4");

    expect(selectCanGoForward(store.getState())).toBe(false);
    act(() => store.getState().next());
    expect(store.getState().ply).toBe(0);
    expect(selectFen(store.getState())).toBe(AFTER_E4);
  });

  it("walks back down the line one move at a time, re-asking for each position", async () => {
    const answers = [
      makeControllableEval({ score: { cp: 1 }, bestMove: null }),
      makeControllableEval({ score: { cp: 2 }, bestMove: null }),
      makeControllableEval({ score: { cp: 3 }, bestMove: null }),
    ];
    evaluate.mockImplementation(() => answers[0]!.run());

    const store = openReview();
    play(store, "e2", "e4");
    play(store, "e7", "e5");
    expect(store.getState().variation?.cursor).toBe(2);

    act(() => store.getState().previous());
    expect(store.getState().variation?.cursor).toBe(1);
    expect(selectFen(store.getState())).toBe(AFTER_E4);
    // Four searches: one per position shown, the walked-back one included.
    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  it("leaves the variation at its first move, without stepping the game", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();
    play(store, "e2", "e4");

    expect(selectCanGoBack(store.getState())).toBe(true);
    act(() => store.getState().previous());

    expect(store.getState().variation).toBeNull();
    expect(store.getState().variationEvaluation).toBeNull();
    expect(store.getState().ply).toBe(0);
    expect(selectFen(store.getState())).toBe(START);
  });

  it("replaces the continuation when a move is played after walking back", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();
    play(store, "e2", "e4");
    play(store, "e7", "e5");
    act(() => store.getState().previous());

    expect(play(store, "d7", "d5")).toBe(true);

    expect(store.getState().variation?.moves.map((move) => move.san)).toEqual([
      "e4",
      "d5",
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
    expect(store.getState().variationEvaluation).toBeNull();
    expect(store.getState().ply).toBe(1);
  });

  it("hands the engine back when the screen goes away", async () => {
    const pending = makeControllableEval({ score: { cp: 0 }, bestMove: null });
    evaluate.mockImplementation(pending.run);

    const store = createReviewStore({ game: { moves, startFen: START } });
    const { unmount } = renderHook(() => useVariationEvaluation(store));
    act(() => {
      store.getState().playMove("e2", "e4");
    });

    unmount();
    await flush();

    expect(pending.wasHalted()).toBe(true);
  });
});

describe("the engine session a review owns", () => {
  it("opens none until a position actually needs one", () => {
    openReview();

    expect(openPositionEvaluator).not.toHaveBeenCalled();
  });

  it("answers every position of a line on the one it opened", () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = openReview();

    play(store, "e2", "e4");
    play(store, "e7", "e5");
    act(() => store.getState().previous());

    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(openPositionEvaluator).toHaveBeenCalledTimes(1);
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
    const store = createReviewStore({ game: { moves, startFen: START } });
    const { unmount } = renderHook(() => useVariationEvaluation(store));
    act(() => {
      store.getState().playMove("e2", "e4");
    });

    unmount();
    await flush();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("opens a fresh one after that, rather than reaching for the closed one", async () => {
    evaluate.mockImplementation(
      makeControllableEval({ score: { cp: 0 }, bestMove: null }).run,
    );
    const store = createReviewStore({ game: { moves, startFen: START } });
    const first = renderHook(() => useVariationEvaluation(store));
    act(() => {
      store.getState().playMove("e2", "e4");
    });
    first.unmount();
    await flush();

    renderHook(() => useVariationEvaluation(store));
    act(() => {
      store.getState().playMove("e7", "e5");
    });

    expect(openPositionEvaluator).toHaveBeenCalledTimes(2);
  });
});
