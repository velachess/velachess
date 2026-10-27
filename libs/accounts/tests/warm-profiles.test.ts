import { describe, expect, it } from "vitest";

import type { ProviderProfile, ProviderSeat } from "@velachess/infra-db";
import type { ProfileFetch } from "@velachess/infra-platforms";

import { warmProfiles, type WarmProfilesDeps } from "../warm-profiles/warm-profiles.ts";

const FRESH = new Date("2026-10-01T00:00:00.000Z");
const STALE = new Date("2026-01-01T00:00:00.000Z");

function cached(username: string, fetchedAt: Date): ProviderProfile {
  return {
    platform: "chess_com",
    username,
    avatarUrl: null,
    flair: null,
    countryCode: null,
    fetchedAt,
  };
}

function harness(rows: ProviderProfile[] = []) {
  const asked: string[] = [];
  const written: string[] = [];
  const deps: WarmProfilesDeps = {
    findProviderProfiles: (seats: ProviderSeat[]) =>
      Promise.resolve(
        rows.filter((row) =>
          seats.some((seat) => seat.username.toLowerCase() === row.username),
        ),
      ),
    upsertProviderProfile: (seat) => {
      written.push(seat.username);
      return Promise.resolve();
    },
    isProfileFresh: (fetchedAt) => fetchedAt.getTime() === FRESH.getTime(),
    fetchProfile: (seat): Promise<ProfileFetch> => {
      asked.push(seat.username);
      return Promise.resolve({ status: "failed", reason: "unavailable" });
    },
  };
  return { deps, asked, written };
}

describe("warming the profiles a sync saw", () => {
  it("asks once per handle, however many games named it", async () => {
    const { deps, asked } = harness();

    await warmProfiles(deps, "chess_com", ["Rival", "rival", "RIVAL", "other"]);

    expect(asked).toEqual(["Rival", "other"]);
  });

  it("leaves a fresh profile alone and refreshes a stale one", async () => {
    // What the cache holds stands until its window passes: re-asking every
    // sync would spend a request per opponent per pass.
    const { deps, asked } = harness([cached("known", FRESH), cached("aged", STALE)]);

    await warmProfiles(deps, "chess_com", ["known", "aged", "unseen"]);

    expect(asked).toEqual(["aged", "unseen"]);
  });

  it("caps a pass, so a year of games is not a burst of requests", async () => {
    const { deps, asked } = harness();

    await warmProfiles(
      deps,
      "chess_com",
      Array.from({ length: 40 }, (_, index) => `rival-${index}`),
    );

    expect(asked).toHaveLength(25);
  });

  it("writes a failed ask through, so the window ages instead of retrying every sync", async () => {
    const { deps, written } = harness();

    await warmProfiles(deps, "chess_com", ["rival"]);

    expect(written).toEqual(["rival"]);
  });

  it("asks nothing when the pass saw nobody", async () => {
    const { deps, asked } = harness();

    await warmProfiles(deps, "chess_com", []);

    expect(asked).toEqual([]);
  });
});
