import { describe, expect, it } from "vitest";

import { onboardingState, type OnboardingInput } from "../onboarding-state.ts";

const account = (syncState: "none" | "queued" | "active" | "failed") => ({
  id: "account-1",
  platform: "chess_com" as const,
  username: "looper",
  lastSyncedAt: null,
  syncState,
});

const state = (input: Partial<OnboardingInput>) =>
  onboardingState({ games: 0, accounts: [], failed: false, ...input }).kind;

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
    expect(state({ accounts: [account("active")] })).toBe("syncing");
    expect(state({ accounts: [account("none")] })).toBe("no-games");
    // A failed job is not a job in flight — nothing more is coming.
    expect(state({ accounts: [account("failed")] })).toBe("no-games");
  });

  it("is ready the moment games exist", () => {
    expect(state({ games: 14, accounts: [] })).toBe("ready");
    // Games from a PGN upload prove there is something to open, whatever
    // the accounts call says.
    expect(state({ games: 14, accounts: [account("none")] })).toBe("ready");
  });
});
