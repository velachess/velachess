/**
 * The API's ear on `sync_job_changed`: one LISTEN per process, fanned out
 * in memory to every open stream. A notification is a wake-up, not a
 * record — Postgres drops it for anyone not listening at that instant —
 * so this hands out ids to resolve against the row, never the row.
 *
 * `listen` is the only driver-facing seam: production passes postgres.js's
 * `sql.listen` (a dedicated connection that reconnects on its own and
 * re-issues LISTEN), the test harness passes PGlite's. Both resolve to the
 * unlisten.
 */

import { SYNC_JOB_CHANGED_CHANNEL } from "./queries/sync-jobs.ts";

export type SyncSignal =
  /** A job settled; read it before believing anything about it. */
  | { kind: "changed"; syncId: string }
  /** The listener was away and is back: whatever settled meanwhile was
   * never announced, so every stream should end and let its client
   * reconcile from the rows. */
  | { kind: "reset" };

export type ListenToChannel = (
  channel: string,
  onNotify: (payload: string) => void,
  /** Called each time the LISTEN is (re)established. */
  onListen: () => void,
) => Promise<() => Promise<void>>;

export interface SyncNotifications {
  /** Resolves once the LISTEN is in place — boot waits on it, so an API
   * that cannot hear the worker refuses to start rather than going quiet. */
  ready: Promise<void>;
  subscribe(listener: (signal: SyncSignal) => void): () => void;
  close(): Promise<void>;
}

/** The id is a uuid column; a payload that is not one would only fail the
 * read. Anyone with NOTIFY rights could write it, so it is checked, not
 * trusted. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSyncNotifications(listen: ListenToChannel): SyncNotifications {
  const listeners = new Set<(signal: SyncSignal) => void>();
  const emit = (signal: SyncSignal) => {
    for (const listener of listeners) listener(signal);
  };

  let connections = 0;
  const unlisten = listen(
    SYNC_JOB_CHANGED_CHANNEL,
    (payload) => {
      if (UUID.test(payload)) emit({ kind: "changed", syncId: payload });
    },
    () => {
      connections += 1;
      if (connections > 1) emit({ kind: "reset" });
    },
  );

  return {
    ready: unlisten.then(() => undefined),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async close() {
      listeners.clear();
      await (
        await unlisten
      )();
    },
  };
}
