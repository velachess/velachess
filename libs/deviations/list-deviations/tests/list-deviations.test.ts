import { describe, expect, it } from "vitest";

import { listDeviationsForUser, type DeviationRow } from "../list-deviations.ts";

function row(overrides: Partial<DeviationRow> = {}): DeviationRow {
  return {
    id: "d1",
    gameId: "g1",
    ply: 10,
    playedSan: "Nf3",
    expectedSans: ["e4"],
    positionKey: null,
    cpLoss: null,
    engineCategory: null,
    drillable: true,
    repertoireName: "My White Repertoire",
    chapterName: "Italian",
    whiteName: "alice",
    blackName: "bob",
    result: "1-0",
    playedAt: null,
    openingName: null,
    gameUrl: null,
    drilled: false,
    ...overrides,
  };
}

describe("listDeviationsForUser", () => {
  it("turns a stored EPD positionKey into a playable FEN", async () => {
    const [deviation] = await listDeviationsForUser(
      {
        listOwnDeviations: async () => [
          row({ positionKey: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -" }),
        ],
      },
      "u1",
    );

    expect(deviation!.fen).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  it("answers null fen for a row with no positionKey", async () => {
    const [deviation] = await listDeviationsForUser(
      { listOwnDeviations: async () => [row({ positionKey: null })] },
      "u1",
    );

    expect(deviation!.fen).toBeNull();
  });

  it("asks the injected reader for exactly this user's rows", async () => {
    let seenUserId: string | null = null;

    await listDeviationsForUser(
      {
        listOwnDeviations: async (userId) => {
          seenUserId = userId;
          return [];
        },
      },
      "u42",
    );

    expect(seenUserId).toBe("u42");
  });
});
