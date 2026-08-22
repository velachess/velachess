import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReplayMove } from "../../analysis-contract.ts";
import { REPLAY_NAVIGATION, useChessReplay } from "../use-chess-replay.ts";

/**
 * A screen test proves you can step forward and back; these pin the
 * edges it never reaches — both ends, a jump out of range, and moves
 * arriving after the hook mounted.
 */

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const moves: ReplayMove[] = [1, 2, 3].map((ply) => ({
  ply,
  san: `move-${ply}`,
  fenBefore: `before-${ply}`,
  fenAfter: `after-${ply}`,
}));

describe("useChessReplay", () => {
  it("opens at the starting position", () => {
    const { result } = renderHook(() => useChessReplay(moves, START));

    expect(result.current.ply).toBe(0);
    expect(result.current.fen).toBe(START);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(true);
  });

  it("emits explicit navigation events without firing on initial render", () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(() => useChessReplay(moves, START, onNavigate));

    expect(onNavigate).not.toHaveBeenCalled();

    act(() => result.current.next());
    expect(onNavigate).toHaveBeenLastCalledWith({
      type: REPLAY_NAVIGATION.MOVE,
      move: moves[0],
    });

    act(() => result.current.previous());
    expect(onNavigate).toHaveBeenLastCalledWith({ type: REPLAY_NAVIGATION.START });
  });

  it("moves one half-move at a time", () => {
    const { result } = renderHook(() => useChessReplay(moves, START));

    act(() => result.current.next());
    expect(result.current.ply).toBe(1);
    expect(result.current.fen).toBe("after-1");

    act(() => result.current.previous());
    expect(result.current.ply).toBe(0);
    expect(result.current.fen).toBe(START);
  });

  it("stops at both ends instead of running past them", () => {
    const { result } = renderHook(() => useChessReplay(moves, START));

    act(() => result.current.previous());
    expect(result.current.ply).toBe(0);

    act(() => result.current.goTo(3));
    expect(result.current.canGoForward).toBe(false);
    act(() => result.current.next());
    expect(result.current.ply).toBe(3);
  });

  it("clamps a jump that lands outside the game", () => {
    const { result } = renderHook(() => useChessReplay(moves, START));

    act(() => result.current.goTo(99));
    expect(result.current.ply).toBe(3);

    act(() => result.current.goTo(-4));
    expect(result.current.ply).toBe(0);
  });

  it("resets to the start", () => {
    const { result } = renderHook(() => useChessReplay(moves, START));

    act(() => result.current.goTo(2));
    act(() => result.current.reset());

    expect(result.current.ply).toBe(0);
  });

  it("survives moves arriving after it mounted", () => {
    // The game is fetched, so the first render has none. A ply held from
    // an empty game must not index into the list that shows up later.
    const { result, rerender } = renderHook(
      ({ list }: { list: ReplayMove[] }) => useChessReplay(list, START),
      { initialProps: { list: [] as ReplayMove[] } },
    );

    expect(result.current.canGoForward).toBe(false);

    rerender({ list: moves });
    expect(result.current.totalPlies).toBe(3);
    expect(result.current.canGoForward).toBe(true);
  });

  it("does not carry a ply into a shorter game", () => {
    // Clamped on read, not on write: the same hook can be handed a
    // different game's moves before the state has any reason to change.
    const { result, rerender } = renderHook(
      ({ list }: { list: ReplayMove[] }) => useChessReplay(list, START),
      { initialProps: { list: moves } },
    );

    act(() => result.current.goTo(3));
    rerender({ list: moves.slice(0, 1) });

    expect(result.current.ply).toBe(1);
    expect(result.current.fen).toBe("after-1");
  });
});
