// @vitest-environment node
/**
 * The one definition of "a sync is still on its way", now that
 * `get-sync`, `request-sync` and `list-accounts` all read it from here.
 * Dropping a status from the list silently reported `idle` for a retrying
 * job and left a stale one un-abandoned, and nothing failed.
 */
import { describe, expect, it } from "vitest";

import { isActiveSyncStatus, type SyncJobStatus } from "../sync-status.ts";

describe("isActiveSyncStatus", () => {
  it.each<SyncJobStatus>(["queued", "running", "retrying"])(
    "%s means a sync is still coming",
    (status) => {
      expect(isActiveSyncStatus(status)).toBe(true);
    },
  );

  it.each<SyncJobStatus>(["succeeded", "failed"])("%s has settled", (status) => {
    expect(isActiveSyncStatus(status)).toBe(false);
  });

  it("treats an account with no job as settled, not active", () => {
    // `latestJobStatus` is null for an account whose newest job is gone.
    expect(isActiveSyncStatus(null)).toBe(false);
    expect(isActiveSyncStatus(undefined)).toBe(false);
  });

  it("narrows, so a caller can use the status it just checked", () => {
    const status: SyncJobStatus | null = "running";

    // The point of a predicate over `includes`: `syncStatus` in
    // `list-accounts` is the active status itself, never `succeeded`.
    expect(isActiveSyncStatus(status) ? status : "idle").toBe("running");
  });
});
