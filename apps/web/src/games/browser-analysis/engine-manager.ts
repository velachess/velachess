import type { GradedPly } from "@velachess/analysis";

import { analyzeGameInBrowser } from "./analyze-game-in-browser.ts";

type ManagerState = "idle" | "running" | "terminated";

/**
 * One Worker, one game at a time. Starting a new game aborts whatever the
 * previous one was doing and waits for its teardown (the quit'd engine
 * session) before the new run actually begins — so two open games never
 * fight over the same Worker, and a fast switch never lets a stale result
 * leak into the game that's open now.
 */
export class EngineManager {
  private state: ManagerState = "idle";
  private epoch = 0;
  private supersede: AbortController | null = null;
  private settled: Promise<void> = Promise.resolve();

  async *runGame(
    rawPgn: string,
    depth: number,
    signal: AbortSignal,
  ): AsyncGenerator<GradedPly> {
    if (this.state === "terminated") {
      throw new Error("EngineManager has been terminated");
    }

    this.supersede?.abort();
    const previousSettled = this.settled;
    const supersede = new AbortController();
    this.supersede = supersede;
    const epoch = ++this.epoch;
    this.state = "running";

    let markSettled!: () => void;
    this.settled = new Promise<void>((resolve) => {
      markSettled = resolve;
    });

    try {
      await previousSettled;
      if (epoch !== this.epoch) return;

      const combined = AbortSignal.any([signal, supersede.signal]);
      for await (const position of analyzeGameInBrowser(rawPgn, depth, combined)) {
        if (epoch !== this.epoch) return;
        yield position;
      }
    } finally {
      markSettled();
      if (epoch === this.epoch) {
        this.state = "idle";
        this.supersede = null;
      }
    }
  }

  cancel(): void {
    this.supersede?.abort();
  }

  terminate(): void {
    this.cancel();
    this.state = "terminated";
    this.supersede = null;
  }
}

export const engineManager = new EngineManager();
