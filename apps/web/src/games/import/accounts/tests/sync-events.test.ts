/**
 * Drift guard: this app cannot import `@velachess/accounts` at runtime (its
 * slices pull in Postgres and `node:crypto`, which a browser bundle cannot
 * load — see `sync-events.ts`), so `SYNC_SETTLED_EVENT_NAMES` is a hand-kept
 * copy of `SYNC_SETTLED_EVENTS`. This test is the one place that is allowed
 * to import the real module, since it runs in Node, not the browser.
 */
import { SYNC_SETTLED_EVENTS } from "@velachess/accounts";
import { describe, expect, it } from "vitest";

import { SYNC_SETTLED_EVENT_NAMES } from "../sync-events.ts";

describe("SYNC_SETTLED_EVENT_NAMES", () => {
  it("matches the server's SYNC_SETTLED_EVENTS", () => {
    expect(SYNC_SETTLED_EVENT_NAMES.toSorted()).toEqual(
      Object.values(SYNC_SETTLED_EVENTS).toSorted(),
    );
  });
});
