// @vitest-environment node
/**
 * The hub over one LISTEN. The driver is faked here — what the real
 * channel delivers, and when, is `sync-jobs.test.ts`'s job — so these
 * hold the fan-out, the id check and the reset on a re-established LISTEN.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createSyncNotifications,
  SYNC_JOB_CHANGED_CHANNEL,
  type SyncSignal,
} from "@velachess/infra-db";

const ID = "11111111-1111-4111-8111-111111111111";

function fakeChannel() {
  let notify: ((payload: string) => void) | undefined;
  let relisten: (() => void) | undefined;
  const unlisten = vi.fn(async () => {});
  const notifications = createSyncNotifications(async (channel, onNotify, onListen) => {
    expect(channel).toBe(SYNC_JOB_CHANGED_CHANNEL);
    notify = onNotify;
    relisten = onListen;
    onListen();
    return unlisten;
  });
  return {
    notifications,
    unlisten,
    notify: (payload: string) => notify!(payload),
    relisten: () => relisten!(),
  };
}

describe("sync notifications", () => {
  it("hands every subscriber the id, until it unsubscribes", async () => {
    const channel = fakeChannel();
    await channel.notifications.ready;
    const first: SyncSignal[] = [];
    const second: SyncSignal[] = [];
    const stop = channel.notifications.subscribe((signal) => first.push(signal));
    channel.notifications.subscribe((signal) => second.push(signal));

    channel.notify(ID);
    stop();
    channel.notify(ID);

    expect(first).toEqual([{ kind: "changed", syncId: ID }]);
    expect(second).toHaveLength(2);
  });

  it("drops a payload that is not a job id", async () => {
    const channel = fakeChannel();
    const heard: SyncSignal[] = [];
    channel.notifications.subscribe((signal) => heard.push(signal));
    channel.notify("drop table sync_jobs");
    expect(heard).toEqual([]);
  });

  it("signals a reset when the LISTEN comes back, never on the first", async () => {
    const channel = fakeChannel();
    await channel.notifications.ready;
    const heard: SyncSignal[] = [];
    channel.notifications.subscribe((signal) => heard.push(signal));
    expect(heard).toEqual([]);

    channel.relisten();
    expect(heard).toEqual([{ kind: "reset" }]);
  });

  it("unlistens on close and tells nobody anything after", async () => {
    const channel = fakeChannel();
    const heard: SyncSignal[] = [];
    channel.notifications.subscribe((signal) => heard.push(signal));
    await channel.notifications.close();
    channel.notify(ID);
    expect(channel.unlisten).toHaveBeenCalledOnce();
    expect(heard).toEqual([]);
  });
});
