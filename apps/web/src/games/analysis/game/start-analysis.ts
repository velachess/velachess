/**
 * Where the engine meets the store: the one place that starts a
 * whole-game pass, decides which pass the store still answers for, and
 * turns what the engine publishes into snapshots.
 *
 * It owns no scheduling, because there is none to own: the pass runs on
 * its own engine session and competes with nothing. The one cancellation
 * it performs is replacing one game's pass with another's, and halting
 * the pass is what disposes that session.
 */
import { run } from "../../../libs/effection.ts";

import {
  IDLE_ANALYSIS,
  setAnalysis,
  snapshotOf,
  type AnalysisSnapshot,
} from "../analysis-store.ts";
import {
  analyzeGameInBrowser,
  type GameAnalysisInput,
} from "./analyze-game-in-browser.ts";

interface Pass {
  readonly gameId: string;
  /** Set in the same synchronous step the pass starts in. */
  halt: (() => void) | null;
}

/** The pass whose results the store accepts. Everything else is stale. */
let active: Pass | null = null;

/** Only the pass that is still active may write, so a ply decided in the
 * same tick as a replacement cannot land in the new game's snapshot. */
function publish(pass: Pass, next: (held: AnalysisSnapshot) => AnalysisSnapshot): void {
  if (active !== pass) return;
  setAnalysis(pass.gameId, next(snapshotOf(pass.gameId)));
}

/**
 * Grades `input`'s game unless that is already happening or already done.
 * Opening a different game replaces the pass under way; leaving the
 * screen does not, because nothing here is called on unmount.
 */
export function startAnalysis(input: GameAnalysisInput): void {
  const held = snapshotOf(input.gameId);
  if (active?.gameId === input.gameId && held.status !== "error") return;

  const previous = active;
  const pass: Pass = { gameId: input.gameId, halt: null };
  active = pass;
  setAnalysis(input.gameId, { status: "analyzing", graded: [], error: null });
  // After `active` moved, so the replaced pass can no longer write,
  // whichever order the two settle in.
  previous?.halt?.();

  const task = run(() =>
    analyzeGameInBrowser(input, (position) => {
      publish(pass, (snapshot) => ({
        status: "analyzing",
        graded: [...snapshot.graded, position],
        error: null,
      }));
    }),
  );
  // `halt()` hands back a lazy handle: the task is interrupted only once
  // that handle is consumed, and consuming it rejects.
  pass.halt = () => void task.halt().catch(() => {});

  void task.then(
    () => publish(pass, (snapshot) => ({ ...snapshot, status: "done" })),
    (error: unknown) => {
      // A replaced pass ends by being halted, and `publish` already
      // refuses a pass that is no longer active — so anything that gets
      // through here is a real failure, not a cancellation.
      publish(pass, (snapshot) => ({
        ...snapshot,
        status: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    },
  );
}

/**
 * Drops the pass under way and forgets its progress. Test-only: this
 * module's state is global on purpose, and the game-id fixture restarts
 * its sequence per test, so a stale "already graded" entry would
 * otherwise answer for a different game.
 */
export function resetAnalysisForTests(): void {
  const previous = active;
  active = null;
  previous?.halt?.();
  if (previous) setAnalysis(previous.gameId, IDLE_ANALYSIS);
}
