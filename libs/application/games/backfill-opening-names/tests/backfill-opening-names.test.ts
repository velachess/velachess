// @vitest-environment node
import type { NormalizedGame } from "@velachess/platforms";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createUser, games, listGames, saveGames } from "@velachess/db";
import { createTestDb } from "@velachess/db/tests/test-db.ts";

import { backfillOpeningNames } from "../backfill-opening-names.ts";

const { db, close } = await createTestDb();

function chessComGame(overrides: Partial<NormalizedGame> = {}): NormalizedGame {
  return {
    source: "chess_com",
    externalId: "100000001",
    externalUrl: "https://www.chess.com/game/live/100000001",
    perspective: null,
    white: { name: "Test-Player", rating: 1500 },
    black: { name: "test-rival", rating: 1480 },
    result: "1-0",
    playedAt: new Date("2024-01-01T18:23:37Z"),
    timeControl: { initialSeconds: 180, incrementSeconds: 0, raw: "180" },
    opening: { eco: "B23" },
    termination: "Test-Player won by resignation",
    hasClocks: true,
    rawPgn: '[Event "Live Chess"]\n\n1. e4 c5 1-0\n',
    movetextHash: "hash-1",
    ...overrides,
  };
}

describe("backfillOpeningNames", () => {
  let ownerId: string;

  beforeEach(async () => {
    await db.delete(games);
    ownerId = (await createUser(db)).id;
  });

  afterAll(() => close());

  it("resolves names from openingUrl for games with null openingName", async () => {
    await saveGames(
      db,
      [
        chessComGame({
          externalId: "eco-url-game",
          movetextHash: "h-eco-url",
          opening: {
            eco: "B23",
            url: "https://www.chess.com/openings/Closed-Sicilian-Defense-Grand-Prix-Attack",
          },
        }),
        chessComGame({
          externalId: "named-game",
          movetextHash: "h-named",
          opening: { eco: "B23", name: "French Defense" },
        }),
        chessComGame({
          externalId: "no-url-game",
          movetextHash: "h-no-url",
          opening: { eco: "C00" },
        }),
      ],
      { userId: ownerId },
    );

    const result = await backfillOpeningNames(db);
    expect(result.updated).toBe(1);

    const rows = await listGames(db, { userId: ownerId });
    const ecoUrlGame = rows.find((r) => r.externalId === "eco-url-game");
    const namedGame = rows.find((r) => r.externalId === "named-game");
    const noUrlGame = rows.find((r) => r.externalId === "no-url-game");

    expect(ecoUrlGame?.openingName).toBe("Closed Sicilian Defense Grand Prix Attack");
    expect(namedGame?.openingName).toBe("French Defense");
    expect(noUrlGame?.openingName).toBeNull();
  });

  it("does not update games that already have an opening name", async () => {
    await saveGames(
      db,
      [
        chessComGame({
          externalId: "already-named",
          movetextHash: "h-already-named",
          opening: {
            name: "London System",
            url: "https://www.chess.com/openings/London-System",
          },
        }),
      ],
      { userId: ownerId },
    );

    const result = await backfillOpeningNames(db);
    expect(result.updated).toBe(0);
  });

  it("returns updated: 0 when no games have openingUrl", async () => {
    await saveGames(
      db,
      [chessComGame({ externalId: "no-url", movetextHash: "h-no-url" })],
      { userId: ownerId },
    );

    const result = await backfillOpeningNames(db);
    expect(result.updated).toBe(0);
  });
});
