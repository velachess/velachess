// @vitest-environment node
/**
 * The slice between a channel anyone may write to and a stream one person
 * reads: what gets through is decided by the row, never by the signal.
 */
import { describe, expect, it } from "vitest";

import { watchSyncs, type WatchSyncsDeps } from "../index.ts";
import type { SyncSignal } from "../watch-syncs/watch-syncs.ts";

type Row = NonNullable<Awaited<ReturnType<WatchSyncsDeps["getSyncJob"]>>>;

function aChannel(rows: Row[]) {
  const listeners = new Set<(signal: SyncSignal) => void>();
  const deps: WatchSyncsDeps = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSyncJob: async (id) => rows.find((row) => row.id === id) ?? null,
  };
  return {
    deps,
    listeners,
    signal: (signal: SyncSignal) => listeners.forEach((listener) => listener(signal)),
  };
}

const row = (overrides: Partial<Row>): Row => ({
  id: "job-1",
  userId: "me",
  accountId: "account-1",
  status: "succeeded",
  gamesInserted: 3,
  ...overrides,
});

/** Reads the next item, or `null` if the generator ended. */
async function next<T>(iterator: AsyncGenerator<T>) {
  const result = await iterator.next();
  return result.done ? null : result.value;
}

describe("watchSyncs", () => {
  it("yields the owner's settled job as the row has it, not as the signal says", async () => {
    const channel = aChannel([row({})]);
    const stream = watchSyncs(channel.deps, "me", new AbortController().signal);
    const first = next(stream);
    channel.signal({ kind: "changed", syncId: "job-1" });
    expect(await first).toEqual({
      syncId: "job-1",
      accountId: "account-1",
      status: "succeeded",
      gamesInserted: 3,
    });
  });

  it("is subscribed before anything is read", () => {
    const channel = aChannel([]);
    watchSyncs(channel.deps, "me", new AbortController().signal);
    expect(channel.listeners.size).toBe(1);
  });

  it("lets nothing through for someone else, a job still running, or a row that is gone", async () => {
    const channel = aChannel([
      row({ id: "theirs", userId: "them" }),
      row({ id: "running", status: "running" }),
      row({ id: "mine", status: "failed", gamesInserted: null }),
    ]);
    const stream = watchSyncs(channel.deps, "me", new AbortController().signal);
    const first = next(stream);
    channel.signal({ kind: "changed", syncId: "theirs" });
    channel.signal({ kind: "changed", syncId: "running" });
    channel.signal({ kind: "changed", syncId: "deleted" });
    channel.signal({ kind: "changed", syncId: "mine" });
    expect(await first).toMatchObject({ syncId: "mine", status: "failed" });
  });

  it("ends on abort and lets go of the channel", async () => {
    const channel = aChannel([]);
    const controller = new AbortController();
    const stream = watchSyncs(channel.deps, "me", controller.signal);
    const first = next(stream);
    controller.abort();
    expect(await first).toBeNull();
    expect(channel.listeners.size).toBe(0);
  });

  it("ends on a reset: what was missed is for the rows to tell", async () => {
    const channel = aChannel([row({})]);
    const stream = watchSyncs(channel.deps, "me", new AbortController().signal);
    const first = next(stream);
    channel.signal({ kind: "reset" });
    expect(await first).toBeNull();
    expect(channel.listeners.size).toBe(0);
  });
});
