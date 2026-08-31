import { describe, expect, it } from "vitest";

import { getOverview, type GetOverviewDeps } from "../get-overview.ts";

function deps(overrides: Partial<GetOverviewDeps> = {}): GetOverviewDeps {
  return {
    countGames: async () => 0,
    countDeviations: async () => 0,
    countExercises: async () => 0,
    countDueCards: async () => 0,
    ...overrides,
  };
}

describe("getOverview", () => {
  it("combines the four independent counts for the user", async () => {
    const overview = await getOverview(
      deps({
        countGames: async (userId) => (userId === "u1" ? 5 : -1),
        countDeviations: async () => 2,
        countExercises: async () => 3,
        countDueCards: async () => 1,
      }),
      "u1",
    );

    expect(overview).toEqual({ games: 5, deviations: 2, exercises: 3, dueCards: 1 });
  });

  it("passes the now argument through to countDueCards", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    let seen: Date | null = null;

    await getOverview(
      deps({
        countDueCards: async (_userId, receivedNow) => {
          seen = receivedNow;
          return 0;
        },
      }),
      "u1",
      now,
    );

    expect(seen).toBe(now);
  });
});
