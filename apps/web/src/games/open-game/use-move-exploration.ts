import { useEffect, useState } from "react";

import type { LegalDestination, MoveSquares, PlayedMove } from "@velachess/chess";
import { legalDestinations, playMove, positionFromFen } from "@velachess/chess";

import type { GradedPly } from "../analysis-contract.ts";
import { run } from "../../libs/effection.ts";

import { exploreMove, type ExplorationVerdict } from "./explore-move.ts";

type ExplorationStatus = "idle" | "evaluating" | "resolved";

/**
 * The move being explored, and everything the evaluation of it needs.
 * `grade` is captured when the move lands rather than read live: the
 * verdict has to compare against the evaluation the move was tried
 * against, not whatever the background pass has published since.
 */
interface Attempt {
  startFen: string;
  move: MoveSquares;
  played: PlayedMove;
  grade: GradedPly;
  status: "evaluating" | "resolved";
  verdict: ExplorationVerdict | undefined;
}

export interface MoveExploration {
  status: ExplorationStatus;
  /** Set the instant a legal alternate move lands — before its eval
   * comes back, so the board advances right away. */
  result: { fen: string; move: MoveSquares } | null;
  /** Set only once `status` is "resolved". */
  verdict: ExplorationVerdict | null;
  /** Legal destinations from the position on screen. Empty once a move
   * has landed — chaining a second exploratory move is out of scope. */
  legalTargetsOf: (square: string) => readonly LegalDestination[];
  tryMove: (from: string, to: string) => boolean;
  exit: () => void;
}

/**
 * Lets a user try an alternate move at the position currently on screen
 * and see it classified against the real engine — without touching the
 * actual graded report or its cache.
 *
 * Three actions, one piece of state. The attempt is only the one on
 * screen while its own `startFen` still matches, same idiom `previewFor`
 * in `analysis-read.ts` uses for its ply-tagged preview — so real replay
 * navigation drops it without anything having to clear it.
 */
export function useMoveExploration(
  fen: string,
  positionGrade: GradedPly | undefined,
): MoveExploration {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const active = attempt?.startFen === fen ? attempt : null;

  /**
   * The one place an exploration is started, and the one place it is
   * stopped. React's cleanup is the rule: everything that makes this
   * attempt stop being the one on screen — a newer move, navigation
   * changing `fen`, `exit()`, the screen going away — runs the same
   * teardown, so the engine is handed back instead of being left
   * searching for an answer nobody will read.
   */
  useEffect(() => {
    if (!active || active.status !== "evaluating") return;

    let cancelled = false;
    const evaluation = run(() =>
      exploreMove(active.startFen, active.played, active.grade),
    );

    evaluation.then(
      (verdict) => {
        if (!cancelled) setAttempt({ ...active, status: "resolved", verdict });
      },
      () => {
        // Not a cancellation — `cancelled` covers those, including the
        // manager preempting this search for a newer one. A real engine
        // failure has no verdict to show, and leaving the attempt in
        // "evaluating" would strand the board, so the exploration ends.
        if (!cancelled) setAttempt(null);
      },
    );

    return () => {
      cancelled = true;
      // `halt()` hands back a lazy handle: the task is interrupted only
      // once that handle is consumed, and consuming it rejects.
      void evaluation.halt().catch(() => {});
    };
  }, [active]);

  function tryMove(from: string, to: string): boolean {
    if (!positionGrade) return false;

    const played = playMove(positionFromFen(fen).unwrap(), from, to);
    if (!played) return false;

    setAttempt({
      startFen: fen,
      move: { from, to },
      played,
      grade: positionGrade,
      status: "evaluating",
      verdict: undefined,
    });
    return true;
  }

  function exit(): void {
    setAttempt(null);
  }

  function legalTargetsOf(square: string): readonly LegalDestination[] {
    if (active) return [];
    try {
      return legalDestinations(positionFromFen(fen).unwrap(), square);
    } catch {
      return [];
    }
  }

  return {
    status: active?.status ?? "idle",
    result: active ? { fen: active.played.fen, move: active.move } : null,
    verdict: active?.verdict ?? null,
    legalTargetsOf,
    tryMove,
    exit,
  };
}
