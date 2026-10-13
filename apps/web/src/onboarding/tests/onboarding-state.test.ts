import { describe, expect, it } from "vitest";

import { onboardingState, type OnboardingInput } from "../onboarding-state.ts";

const account = (
  syncStatus: "idle" | "queued" | "running" | "retrying",
  lastSyncError: "incomplete" | null = null,
) => ({
  id: "account-1",
  platform: "chess_com" as const,
  username: "looper",
  lastSyncedAt: null,
  syncStatus,
  activeSyncId: syncStatus === "idle" ? null : "sync-1",
  lastSyncError,
});

const state = (input: Partial<OnboardingInput>) =>
  onboardingState({ games: 0, accounts: [], onboarded: false, failed: false, ...input })
    .kind;

describe("which first-run state this is", () => {
  it("onboards an account that has connected nothing", () => {
    expect(state({})).toBe("onboarding");
  });

  it("does not onboard somebody whose backend just failed", () => {
    // An error answered as "you haven't started" tells people to redo
    // work they already did.
    expect(state({ failed: true })).toBe("error");
    expect(state({ failed: true, games: undefined, accounts: undefined })).toBe("error");
  });

  it("waits rather than guessing while either answer is missing", () => {
    expect(state({ games: undefined })).toBe("loading");
    expect(state({ accounts: undefined })).toBe("loading");
  });

  it("separates a sync in flight from an archive that came back empty", () => {
    expect(state({ accounts: [account("queued")] })).toBe("syncing");
    expect(state({ accounts: [account("running")] })).toBe("syncing");
    expect(state({ accounts: [account("retrying")] })).toBe("syncing");
    expect(state({ accounts: [account("idle")] })).toBe("no-games");
    // A failed job is not a job in flight — nothing more is coming.
    expect(state({ accounts: [account("idle", "incomplete")] })).toBe("no-games");
  });

  it("onboards once: somebody who has been through it never sees it again", () => {
    // Disconnecting every account used to read exactly like a brand-new
    // account and put the tour back on screen, with no way to dismiss it.
    expect(state({ onboarded: true })).toBe("no-games");
    expect(state({ onboarded: true, accounts: [account("idle")] })).toBe("no-games");
    // Still nothing dishonest while a pass is on its way or an answer is
    // missing: those states don't depend on having onboarded.
    expect(state({ onboarded: true, accounts: [account("queued")] })).toBe("syncing");
    expect(state({ onboarded: true, games: undefined })).toBe("loading");
    expect(state({ onboarded: true, failed: true })).toBe("error");
  });

  it("is ready the moment games exist", () => {
    expect(state({ games: 14, accounts: [] })).toBe("ready");
    // Games from a PGN upload prove there is something to open, whatever
    // the accounts call says.
    expect(state({ games: 14, accounts: [account("idle")] })).toBe("ready");
  });
});
