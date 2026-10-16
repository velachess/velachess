import { useEffect, useRef, useState } from "react";

import type { LegalDestination, MoveSquares } from "@velachess/chess";
import { legalDestinations, playMove, positionFromFen } from "@velachess/chess";

import { classifyMove, type GradedPly, type MoveCategory } from "../analysis-contract.ts";
import { engineManager } from "../browser-analysis/index.ts";

/** Matches `use-browser-analysis.ts`'s own literal — no depth control
 * exposed anywhere in this app yet, for the real review or exploration. */
const EXPLORATION_DEPTH = 14;

type ExplorationStatus = "idle" | "evaluating" | "resolved";

interface Attempt {
  startFen: string;
  move: MoveSquares;
  resultFen: string;
  status: "evaluating" | "resolved";
  verdict: { category: MoveCategory; winChanceLoss: number } | undefined;
}

export interface MoveExploration {
  status: ExplorationStatus;
  /** Set the instant a legal alternate move lands — before its eval
   * comes back, so the board advances right away. */
  result: { fen: string; move: MoveSquares } | null;
  /** Set only once `status` is "resolved". */
  verdict: { category: MoveCategory; winChanceLoss: number } | null;
  /** Legal destinations from the position on screen. Empty once a move
   * has landed — chaining a second exploratory move is out of scope. */
  legalTargetsOf: (square: string) => readonly LegalDestination[];
  tryMove: (from: string, to: string) => boolean;
  exit: () => void;
}

function sideToMove(fen: string): "white" | "black" {
  return fen.includes(" w ") ? "white" : "black";
}

/**
 * Lets a user try an alternate move at the position currently on screen
 * and see it classified against the real engine — without touching the
 * actual graded report or its cache.
 *
 * Owns one piece of state (the attempt, if any); everything this returns
 * derives from comparing it against the `fen` on screen right now, same
 * idiom `previewFor` in `analysis-read.ts` already uses for its own
 * ply-tagged preview. Real replay navigation changes `fen` out from under
 * a stale attempt, which simply stops being selected — no effect needed
 * to notice that. The one exception is the component leaving the screen
 * entirely, which nothing can derive; that's the only effect below.
 */
export function useMoveExploration(
  fen: string,
  positionGrade: GradedPly | undefined,
): MoveExploration {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const active = attempt && attempt.startFen === fen ? attempt : null;

  function tryMove(from: string, to: string): boolean {
    if (!positionGrade) return false;

    const position = positionFromFen(fen).unwrap();
    const played = playMove(position, from, to);
    if (!played) return false;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setAttempt({
      startFen: fen,
      move: { from, to },
      resultFen: played.fen,
      status: "evaluating",
      verdict: undefined,
    });

    void engineManager
      .evaluatePosition(played.fen, EXPLORATION_DEPTH, controller.signal)
      .then((raw) => {
        // `raw === undefined` means a newer evaluatePosition() call
        // superseded this one; `controllerRef.current !== controller`
        // catches the other way an attempt goes stale — exit() or
        // unmount, which abort the signal without starting a new call,
        // so EngineManager's own epoch never advances to flag it.
        if (raw === undefined || controllerRef.current !== controller) return;

        const { category, winChanceLoss } = classifyMove({
          before: positionGrade.evalBefore,
          after: raw.score,
          mover: sideToMove(fen),
          wasEngineBest: positionGrade.bestMove === played.uci,
        });

        setAttempt({
          startFen: fen,
          move: { from, to },
          resultFen: played.fen,
          status: "resolved",
          verdict: { category, winChanceLoss },
        });
      });

    return true;
  }

  function exit(): void {
    controllerRef.current?.abort();
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
    result: active ? { fen: active.resultFen, move: active.move } : null,
    verdict: active?.verdict ?? null,
    legalTargetsOf,
    tryMove,
    exit,
  };
}
