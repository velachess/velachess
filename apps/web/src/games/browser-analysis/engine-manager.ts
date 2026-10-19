import type { GradedPly, RawEval } from "@velachess/analysis";

import { analyzeGameInBrowser } from "./analyze-game-in-browser.ts";
import { evaluatePositionInBrowser } from "./evaluate-position-in-browser.ts";

type ManagerState = "idle" | "running" | "terminated";

/**
 * One Worker, one thing at a time, across two priority lanes:
 * `background` (`runGame` — the review screen's whole-game pass) and
 * `interactive` (`evaluatePosition` — a single ad-hoc FEN from a user
 * exploring an alternate move on the board). A new call always supersedes
 * a still-running call *in its own lane* (last-call-wins, same as before
 * this had two lanes) — but across lanes, interactive always preempts
 * background, never the other way around: background queues behind an
 * active interactive call instead of aborting it. That precedence mirrors
 * chessflare's own interactive board, which calls `interruptQueue()`
 * before every on-demand search against its one shared engine instance —
 * adapted here as two independent epoch/abort pairs instead of one shared
 * counter, since a background call queueing behind an active interactive
 * one must not invalidate that interactive call's own result.
 *
 * Both lanes still share one `settled` handoff, so the thing that's
 * actually running — background or interactive — always finishes
 * tearing down its engine session before the other lane's call starts
 * its own. Two lanes never run a Worker at the same time.
 */
export class EngineManager {
  private state: ManagerState = "idle";
  private backgroundEpoch = 0;
  private interactiveEpoch = 0;
  private backgroundSupersede: AbortController | null = null;
  private interactiveSupersede: AbortController | null = null;
  private settled: Promise<void> = Promise.resolve();

  async *runGame(
    gameId: string,
    rawPgn: string,
    depth: number,
    signal: AbortSignal,
  ): AsyncGenerator<GradedPly> {
    if (this.state === "terminated") {
      throw new Error("EngineManager has been terminated");
    }

    this.backgroundSupersede?.abort();
    const previousSettled = this.settled;
    const supersede = new AbortController();
    this.backgroundSupersede = supersede;
    const epoch = ++this.backgroundEpoch;
    this.state = "running";

    let markSettled!: () => void;
    this.settled = new Promise<void>((resolve) => {
      markSettled = resolve;
    });

    try {
      await previousSettled;
      if (epoch !== this.backgroundEpoch) return;

      const combined = AbortSignal.any([signal, supersede.signal]);
      for await (const position of analyzeGameInBrowser(
        gameId,
        rawPgn,
        depth,
        combined,
      )) {
        if (epoch !== this.backgroundEpoch) return;
        yield position;
      }
    } finally {
      markSettled();
      if (epoch === this.backgroundEpoch) {
        this.state = "idle";
        this.backgroundSupersede = null;
      }
    }
  }

  /**
   * One ad-hoc FEN, outside the replayed game — the board's interactive
   * exploration. Preempts whatever's running in *either* lane; a stale
   * call (superseded while queued, or by a newer interactive call before
   * its own result came back) resolves to `undefined` instead of a
   * `RawEval`, the same "nothing to show" signal `runGame`'s generator
   * gives by simply ending the stream early.
   */
  async evaluatePosition(
    fen: string,
    depth: number,
    signal: AbortSignal,
  ): Promise<RawEval | undefined> {
    if (this.state === "terminated") {
      throw new Error("EngineManager has been terminated");
    }

    this.backgroundSupersede?.abort();
    this.interactiveSupersede?.abort();
    const previousSettled = this.settled;
    const supersede = new AbortController();
    this.interactiveSupersede = supersede;
    const epoch = ++this.interactiveEpoch;

    let markSettled!: () => void;
    this.settled = new Promise<void>((resolve) => {
      markSettled = resolve;
    });

    try {
      await previousSettled;
      if (epoch !== this.interactiveEpoch) return undefined;

      const combined = AbortSignal.any([signal, supersede.signal]);
      const result = await evaluatePositionInBrowser(fen, depth, combined);
      return epoch === this.interactiveEpoch ? result : undefined;
    } finally {
      markSettled();
      if (epoch === this.interactiveEpoch) {
        this.interactiveSupersede = null;
      }
    }
  }

  cancel(): void {
    this.backgroundSupersede?.abort();
    this.interactiveSupersede?.abort();
  }

  terminate(): void {
    this.cancel();
    this.state = "terminated";
    this.backgroundSupersede = null;
    this.interactiveSupersede = null;
  }
}

export const engineManager = new EngineManager();
