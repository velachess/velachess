import type { AnalysisRequest } from "../request-analysis/request-analysis.ts";
import { requestAnalysis } from "../request-analysis/request-analysis.ts";
import type { Database } from "@velachess/db";
import { listProgress } from "@velachess/db";
import type { AnalysisQueue } from "@velachess/queue/ports";

/**
 * One shared poll loop per game, not one per subscriber — avoids N connections
 * each re-polling the database for the same game. First subscriber starts it, last one stops it; scoped per process.
 */

interface ProgressRow {
  runId: string;
  index: number;
  total: number;
  position: unknown;
}

/** What a subscriber sees: everything known, and whether it is over. */
interface WatchSnapshot {
  rows: ProgressRow[];
  terminal: AnalysisRequest | null;
}

export interface Watchers {
  /**
   * Yields the current snapshot immediately — a late subscriber is never
   * behind — then one per change, ending after a terminal state.
   */
  watch(gameId: string, signal: AbortSignal): AsyncGenerator<WatchSnapshot>;
  /** Live loops. For tests and for a metric worth having later. */
  size(): number;
  /** Stops every loop. For shutdown — and for a test suite's teardown. */
  close(): void;
}

interface Watch {
  snapshot: WatchSnapshot;
  listeners: Set<() => void>;
  stop: () => void;
}

export interface WatcherDeps {
  db: Database;
  analysisQueue: AnalysisQueue;
  /** How often the shared loop asks. */
  intervalMs?: number;
}

export function createWatchers(deps: WatcherDeps): Watchers {
  const interval = deps.intervalMs ?? 400;
  const watches = new Map<string, Watch>();

  const start = (gameId: string): Watch => {
    let running = true;
    const watch: Watch = {
      snapshot: { rows: [], terminal: null },
      listeners: new Set(),
      stop: () => {
        running = false;
        watches.delete(gameId);
      },
    };
    watches.set(gameId, watch);

    void (async () => {
      // A poll that throws stops this loop rather than the process. The
      // database going away — a shutdown, a suite tearing down — is the
      // ordinary case, and subscribers are woken so they end too.
      try {
        while (running) {
          // Progress first, then the terminal check: a run that finished
          // between the two reads still reports everything it graded
          // before it reports being over.
          // oxlint-disable-next-line eslint/no-await-in-loop
          const rows = (await listProgress(deps.db, gameId)) as ProgressRow[];
          // oxlint-disable-next-line eslint/no-await-in-loop
          const state = await requestAnalysis(deps.db, deps.analysisQueue, gameId);
          const terminal =
            state.status === "completed" || state.status === "failed" ? state : null;

          const changed =
            rows.length !== watch.snapshot.rows.length ||
            terminal !== watch.snapshot.terminal;
          if (changed) {
            watch.snapshot = { rows, terminal };
            for (const wake of watch.listeners) wake();
          }
          if (terminal) {
            watch.stop();
            return;
          }

          // oxlint-disable-next-line eslint/no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, interval));
        }
      } catch {
        watch.stop();
        for (const wake of watch.listeners) wake();
      }
    })();

    return watch;
  };

  return {
    size: () => watches.size,

    close() {
      // Safe to iterate directly: `stop()` deletes the entry currently
      // being visited, and `Map` iteration tolerates that — it only
      // skips entries deleted before they'd have been reached.
      for (const watch of watches.values()) watch.stop();
    },

    async *watch(gameId, signal) {
      const watch = watches.get(gameId) ?? start(gameId);

      let wake: (() => void) | null = null;
      const listener = () => {
        const waiting = wake;
        wake = null;
        waiting?.();
      };
      watch.listeners.add(listener);
      signal.addEventListener("abort", listener, { once: true });

      try {
        let seen: WatchSnapshot | null = null;
        for (;;) {
          if (watch.snapshot !== seen) {
            seen = watch.snapshot;
            yield seen;
            if (seen.terminal) return;
          }
          // A stopped loop publishes nothing more, so waiting on it is
          // waiting forever.
          if (signal.aborted || watches.get(gameId) !== watch) return;

          // oxlint-disable-next-line eslint/no-await-in-loop
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      } finally {
        watch.listeners.delete(listener);
        signal.removeEventListener("abort", listener);
        // The last one out turns off the light. A loop nobody reads is
        // the cost this whole file exists to avoid.
        if (watch.listeners.size === 0) watch.stop();
      }
    },
  };
}
