// @vitest-environment node
/** The account's game list: one row per game, newest first, with the analyzed flag. */
import type { NormalizedGame } from "@velachess/infra-platforms";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ensureUser,
  listGamesWithStatusForAccount,
  saveGames,
  upsertTrackedAccount,
} from "@velachess/infra-db";

import { createTestDb } from "./test-db.ts";

const { db, close } = await createTestDb();

function syncedGame(externalId: string): NormalizedGame {
  return {
    source: "chess_com",
    externalId,
    externalUrl: `https://www.chess.com/game/live/${externalId}`,
    perspective: null,
    white: { name: "looper", rating: 1500 },
    black: { name: "rival", rating: 1500 },
    result: "1-0",
    playedAt: new Date("2026-08-01T12:00:00Z"),
    timeControl: { initialSeconds: 180, incrementSeconds: 0, raw: "180" },
    // The normalized shape declares these optional, not nullable — a synced
    // game without opening metadata simply omits them.
    opening: {},
    hasClocks: false,
    rawPgn: '[White "looper"]\n[Black "rival"]\n\n1. e4 e6 1-0\n',
    movetextHash: `hash-${externalId}`,
  };
}

let accountId: string;

beforeAll(async () => {
  const user = await ensureUser(db, "status-flow@test.local");
  const account = await upsertTrackedAccount(db, user.id, "chess_com", "looper");
  accountId = account.id;

  await saveGames(db, [syncedGame("1001"), syncedGame("1002")], {
    userId: user.id,
    accountId,
  });
});

afterAll(close);

describe("the account's game list", () => {
  it("shows one row per game", async () => {
    const rows = (await listGamesWithStatusForAccount(db, accountId))!;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.analyzed === false)).toBe(true);
  });
});
