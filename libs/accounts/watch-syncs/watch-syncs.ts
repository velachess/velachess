/**
 * WatchSyncs — the owner's settled syncs, as they happen. Each signal
 * names a job; the row decides whether it is this user's and whether it
 * has settled. A signal is never evidence of either: the channel is one
 * for every process, and Postgres keeps no record of what it delivered.
 */
import { isActiveSyncStatus, type SyncJobStatus } from "../sync-status.ts";

export type SyncSignal = { kind: "changed"; syncId: string } | { kind: "reset" };

type Subscribe = (listener: (signal: SyncSignal) => void) => () => void;
/** Unscoped on purpose: ownership is decided here, against the row. */
type GetSyncJob = (id: string) => Promise<{
  id: string;
  userId: string;
  accountId: string;
  status: SyncJobStatus;
  gamesInserted: number | null;
} | null>;

export interface WatchSyncsDeps {
  subscribe: Subscribe;
  getSyncJob: GetSyncJob;
}

export interface SyncSettled {
  syncId: string;
  accountId: string;
  status: "succeeded" | "failed";
  gamesInserted: number | null;
}

/**
 * Subscribed the moment it is called, before the caller has read anything:
 * a client that takes its snapshot after the stream opens cannot fall
 * between that snapshot and the subscription. Ends on abort, or on a
 * `reset` — the listener was away, so whatever settled meanwhile is
 * unannounced and the client must reconcile from the rows instead.
 */
export function watchSyncs(
  deps: WatchSyncsDeps,
  userId: string,
  signal: AbortSignal,
): AsyncGenerator<SyncSettled> {
  const pending: SyncSignal[] = [];
  let wake: (() => void) | null = null;
  const wakeUp = () => {
    const waiting = wake;
    wake = null;
    waiting?.();
  };
  const unsubscribe = deps.subscribe((next) => {
    pending.push(next);
    wakeUp();
  });
  signal.addEventListener("abort", wakeUp, { once: true });

  return (async function* () {
    try {
      while (!signal.aborted) {
        const next = pending.shift();
        if (!next) {
          // oxlint-disable-next-line eslint/no-await-in-loop
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          continue;
        }
        if (next.kind === "reset") return;

        // oxlint-disable-next-line eslint/no-await-in-loop
        const job = await deps.getSyncJob(next.syncId);
        // Gone with its account, someone else's, or not settled after all.
        if (!job || job.userId !== userId || isActiveSyncStatus(job.status)) continue;
        yield {
          syncId: job.id,
          accountId: job.accountId,
          status: job.status,
          gamesInserted: job.gamesInserted,
        };
      }
    } finally {
      unsubscribe();
      signal.removeEventListener("abort", wakeUp);
    }
  })();
}
