import { describe, expect, it } from "vitest";

import { dashboardState, type DashboardInput } from "../dashboard-state.ts";

const NOTHING = { games: 0, deviations: 0, exercises: 0, dueCards: 0 };
const SOMETHING = { games: 14, deviations: 3, exercises: 2, dueCards: 1 };

const account = (syncState: "none" | "queued" | "active" | "failed") => ({
  id: "account-1",
  platform: "chess_com" as const,
  username: "looper",
  lastSyncedAt: null,
  syncState,
});

const state = (input: Partial<DashboardInput>) =>
  dashboardState({ overview: NOTHING, accounts: [], failed: false, ...input }).kind;

describe("which dashboard this is", () => {
  it("onboards an account that has connected nothing", () => {
    expect(state({})).toBe("onboarding");
  });

  it("does not onboard somebody whose backend just failed", () => {
    // The distinction that matters most: an error answered as
    // "you haven't started" tells people to redo work they already did.
    expect(state({ failed: true })).toBe("error");
    expect(state({ failed: true, overview: undefined, accounts: undefined })).toBe(
      "error",
    );
  });

  it("waits rather than guessing while either answer is missing", () => {
    expect(state({ overview: undefined })).toBe("loading");
    expect(state({ accounts: undefined })).toBe("loading");
  });

  it("separates a sync in flight from an archive that came back empty", () => {
    expect(state({ accounts: [account("queued")] })).toBe("syncing");
    expect(state({ accounts: [account("active")] })).toBe("syncing");
    expect(state({ accounts: [account("none")] })).toBe("no-games");
    // A failed job is not a job in flight — nothing more is coming, so
    // the honest answer is the same as a finished empty pass.
    expect(state({ accounts: [account("failed")] })).toBe("no-games");
  });

  it("shows the real dashboard the moment games exist", () => {
    expect(state({ overview: SOMETHING, accounts: [] })).toBe("ready");
    // Even with no account on record: games in the archive are the proof
    // that something was connected, whatever the accounts call says.
    expect(state({ overview: SOMETHING, accounts: [account("none")] })).toBe("ready");
  });
});
