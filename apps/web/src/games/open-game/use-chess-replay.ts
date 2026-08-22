import { useState } from "react";

import { fenAtPly } from "../analysis-read.ts";
import type { ReplayMove } from "../analysis-contract.ts";

/** Steps through a finished game, owning one piece of state (the ply); everything else derives during render. Takes moves, not a PGN, to avoid re-parsing. */
export interface ChessReplay {
  /** One half-move. 0 is the position before anyone moved. */
  ply: number;
  fen: string;
  moves: ReplayMove[];
  totalPlies: number;
  canGoBack: boolean;
  canGoForward: boolean;
  goTo: (ply: number) => void;
  previous: () => void;
  next: () => void;
  reset: () => void;
}

export const REPLAY_NAVIGATION = {
  START: "start",
  MOVE: "move",
} as const;

export type ReplayNavigationEvent =
  | { type: typeof REPLAY_NAVIGATION.START }
  | { type: typeof REPLAY_NAVIGATION.MOVE; move: ReplayMove };

export type ReplayNavigation = (event: ReplayNavigationEvent) => void;

export function useChessReplay(
  moves: ReplayMove[],
  startFen: string,
  onNavigate?: ReplayNavigation,
): ChessReplay {
  const [ply, setPly] = useState(0);

  // Clamped on read, not write: `moves` arrives async, so a ply set
  // against a longer game must not index into a shorter one.
  const current = Math.min(ply, moves.length);

  const navigate = (target: number) => {
    const next = Math.min(Math.max(target, 0), moves.length);
    if (next === current) return;
    const move = moves[next - 1];
    onNavigate?.(
      move ? { type: REPLAY_NAVIGATION.MOVE, move } : { type: REPLAY_NAVIGATION.START },
    );
    setPly(next);
  };

  return {
    ply: current,
    fen: fenAtPly(moves, startFen, current),
    moves,
    totalPlies: moves.length,
    canGoBack: current > 0,
    canGoForward: current < moves.length,
    goTo: navigate,
    previous: () => navigate(current - 1),
    next: () => navigate(current + 1),
    reset: () => navigate(0),
  };
}
