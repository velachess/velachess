import { SYNC_SETTLED_EVENTS as SERVER_EVENTS } from "@velachess/accounts";
import { describe, expect, it } from "vitest";

import { SYNC_SETTLED_EVENTS } from "../use-sync-events.ts";

/** The one place this app may import a backend module. A rename on either
 * side leaves the stream silent rather than broken, so it is guarded. */
describe("the settled event names", () => {
  it("match the server's SYNC_SETTLED_EVENTS", () => {
    expect(SYNC_SETTLED_EVENTS).toEqual(SERVER_EVENTS);
  });
});
