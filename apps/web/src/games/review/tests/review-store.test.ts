import { describe, expect, it, vi } from "vitest";

import type { ReplayMove } from "../game-record.ts";
import {
  createReviewStore,
  REPLAY_NAVIGATION,
  selectCanGoBack,
  selectCanGoForward,
  selectFen,
  selectTotalPlies,
} from "../review-store.ts";

/**
 * A screen test proves you can step forward and back; these pin the edges
 * it never reaches — both ends, a jump out of range, and what navigating
 * announces. The store is synchronous, so none of it needs React, an
 * engine or a scheduler. Variations are `variation.test.ts`.
 */

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const moves: ReplayMove[] = [1, 2, 3].map((ply) => ({
  ply,
  san: `move-${ply}`,
  fenBefore: `before-${ply}`,
  fenAfter: `after-${ply}`,
}));

const aReview = (onNavigate?: () => void) =>
  createReviewStore({ game: { moves, startFen: START }, onNavigate });

describe("review navigation", () => {
  it("opens at the starting position", () => {
    const state = aReview().getState();

    expect(state.ply).toBe(0);
    expect(selectFen(state)).toBe(START);
    expect(selectTotalPlies(state)).toBe(3);
    expect(selectCanGoBack(state)).toBe(false);
    expect(selectCanGoForward(state)).toBe(true);
  });

  it("announces explicit navigation, and nothing on creation", () => {
    const onNavigate = vi.fn();
    const store = aReview(onNavigate);

    expect(onNavigate).not.toHaveBeenCalled();

    store.getState().next();
    expect(onNavigate).toHaveBeenLastCalledWith({
      type: REPLAY_NAVIGATION.MOVE,
      move: moves[0],
    });

    store.getState().previous();
    expect(onNavigate).toHaveBeenLastCalledWith({ type: REPLAY_NAVIGATION.START });
  });

  it("moves one half-move at a time", () => {
    const store = aReview();

    store.getState().next();
    expect(store.getState().ply).toBe(1);
    expect(selectFen(store.getState())).toBe("after-1");

    store.getState().previous();
    expect(store.getState().ply).toBe(0);
    expect(selectFen(store.getState())).toBe(START);
  });

  it("stops at both ends instead of running past them", () => {
    const store = aReview();

    store.getState().previous();
    expect(store.getState().ply).toBe(0);

    store.getState().goToPly(3);
    expect(selectCanGoForward(store.getState())).toBe(false);
    store.getState().next();
    expect(store.getState().ply).toBe(3);
  });

  it("clamps a jump that lands outside the game", () => {
    const store = aReview();

    store.getState().goToPly(99);
    expect(store.getState().ply).toBe(3);

    store.getState().goToPly(-4);
    expect(store.getState().ply).toBe(0);
  });

  it("says nothing about a jump that lands where it already is", () => {
    const onNavigate = vi.fn();
    const store = aReview(onNavigate);

    store.getState().goToPly(0);

    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe("the engine's move someone asked to see", () => {
  it("is remembered until the board steps anywhere", () => {
    const store = aReview();

    store.getState().showBest("d4");
    expect(store.getState().preview).toBe("d4");

    store.getState().next();
    expect(store.getState().preview).toBeNull();
  });
});
