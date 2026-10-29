import { SYNC_SETTLED_EVENTS as SERVER_EVENTS } from "@velachess/accounts";
import { describe, expect, it } from "vitest";

import { SYNC_SETTLED_EVENTS } from "../use-sync-events.ts";

/** The one place this app may import a backend module: the copy exists
 * because the runtime import cannot, and a rename on either side would
 * otherwise leave the stream silent rather than broken. */
describe("the settled event names", () => {
  it("match the server's SYNC_SETTLED_EVENTS", () => {
    expect(SYNC_SETTLED_EVENTS).toEqual(SERVER_EVENTS);
  });
});
