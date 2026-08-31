// Unit tests — pure mapping, no database.
import { describe, expect, it } from "vitest";

import { judgmentToRow, type DeviationResult } from "@velachess/infra-db";

const ctx = {
  gameId: "game-1",
  repertoireId: "rep-1",
  chapterId: "ch-1",
  repertoireName: "My White openings",
  chapterName: "French",
};

describe("judgmentToRow", () => {
  it("maps event: null to type 'completed' with null event columns", () => {
    const result: DeviationResult = { inBookPlies: 12, event: null };
    const row = judgmentToRow(ctx, result);

    expect(row.type).toBe("completed");
    expect(row.inBookPlies).toBe(12);
    expect(row.ply).toBeNull();
    expect(row.positionKey).toBeNull();
    expect(row.playedSan).toBeNull();
    expect(row.expectedSans).toBeNull();
    expect(row.repertoireNameSnapshot).toBe("My White openings");
    expect(row.chapterNameSnapshot).toBe("French");
  });

  it("maps a deviation event with expectedSans", () => {
    const result: DeviationResult = {
      inBookPlies: 2,
      event: {
        type: "deviation",
        ply: 3,
        positionKey: "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
        actualSan: "Nf3",
        expectedMoves: [{ san: "d4" }],
      },
    };
    const row = judgmentToRow(ctx, result);

    expect(row.type).toBe("deviation");
    expect(row.ply).toBe(3);
    expect(row.playedSan).toBe("Nf3");
    expect(row.expectedSans).toEqual(["d4"]);
  });

  it("maps gap and book-ended without expectedSans", () => {
    for (const type of ["gap", "book-ended"] as const) {
      const result: DeviationResult = {
        inBookPlies: 1,
        event: {
          type,
          ply: 2,
          positionKey: "k",
          actualSan: "c5",
        },
      };
      const row = judgmentToRow(ctx, result);
      expect(row.type).toBe(type);
      expect(row.expectedSans).toBeNull();
    }
  });
});
