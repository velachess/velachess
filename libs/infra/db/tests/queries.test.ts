// @vitest-environment node
import type { NormalizedGame } from "@velachess/infra-platforms";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createUser,
  games,
  getTrackedAccountCursor,
  listGames,
  saveGames,
  trackedAccounts,
  updateTrackedAccountCursor,
  upsertTrackedAccount,
} from "@velachess/infra-db";

import { createTestDb } from "./test-db.ts";

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

function pastedGame(overrides: Partial<NormalizedGame> = {}): NormalizedGame {
  return {
    source: "pgn",
    externalId: null,
    externalUrl: null,
    perspective: null,
    white: { name: "alice" },
    black: { name: "bob" },
    result: "1/2-1/2",
    timeControl: {},
    opening: {},
    hasClocks: false,
    rawPgn: '[Event "?"]\n\n1. e4 e5 1/2-1/2\n',
    movetextHash: "hash-paste",
    ...overrides,
  };
}

describe("libs/infra/db (games + tracked accounts)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await db.delete(games);
    await db.delete(trackedAccounts);
    // Accounts can no longer exist unowned, so every test gets an owner.
    ownerId = (await createUser(db)).id;
  });

  afterAll(() => close());

  it("saveGames twice with the same Chess.com game inserts it once", async () => {
    const account = await upsertTrackedAccount(db, ownerId, "chess_com", "Test-Player");
    const first = await saveGames(db, [chessComGame()], {
      userId: ownerId,
      accountId: account.id,
    });
    const second = await saveGames(db, [chessComGame()], {
      userId: ownerId,
      accountId: account.id,
    });

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
  });

  it("two accounts tracking the same real game both keep their own copy", async () => {
    // The bug this constraint fixes: two different tracked accounts (any
    // two users, or the same user twice) independently sync the same
    // real chess.com game. Each must get its own complete history —
    // dedup happens within an account, never across accounts.
    const other = (await createUser(db)).id;
    const accountA = await upsertTrackedAccount(db, ownerId, "chess_com", "Test-Player");
    const accountB = await upsertTrackedAccount(db, other, "chess_com", "Test-Player");

    const first = await saveGames(db, [chessComGame()], {
      userId: ownerId,
      accountId: accountA.id,
    });
    const second = await saveGames(db, [chessComGame()], {
      userId: other,
      accountId: accountB.id,
    });

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(1);

    const [rowsA, rowsB] = await Promise.all([
      listGames(db, { accountId: accountA.id }),
      listGames(db, { accountId: accountB.id }),
    ]);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
  });

  it("a pasted PGN re-imported by the same user inserts it once", async () => {
    const first = await saveGames(db, [pastedGame()], { userId: ownerId });
    const second = await saveGames(db, [pastedGame()], { userId: ownerId });

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
  });

  it("two users importing the same pasted PGN each keep their own copy", async () => {
    // Ownership is per user: movetext dedup must not leak one user's
    // paste into another's library as an invisible skip.
    const other = (await createUser(db)).id;
    const mine = await saveGames(db, [pastedGame()], { userId: ownerId });
    const theirs = await saveGames(db, [pastedGame()], { userId: other });

    expect(mine.inserted).toBe(1);
    expect(theirs.inserted).toBe(1);
    expect(await listGames(db, { userId: ownerId })).toHaveLength(1);
    expect(await listGames(db, { userId: other })).toHaveLength(1);
  });

  it("a batch containing an intra-statement duplicate only inserts one row", async () => {
    const result = await saveGames(db, [pastedGame(), pastedGame()], {
      userId: ownerId,
    });
    expect(result.inserted).toBe(1);
  });

  it("deleting a tracked account leaves its games with account_id set to null", async () => {
    const account = await upsertTrackedAccount(db, ownerId, "chess_com", "Test-Player");
    await saveGames(db, [chessComGame()], {
      userId: ownerId,
      accountId: account.id,
    });

    await db.delete(trackedAccounts).where(eq(trackedAccounts.id, account.id));

    const [row] = await listGames(db);
    expect(row?.accountId).toBeNull();
  });

  it("upsertTrackedAccount is case-insensitive and returns one row", async () => {
    const first = await upsertTrackedAccount(db, ownerId, "chess_com", "Test-Player");
    const second = await upsertTrackedAccount(db, ownerId, "chess_com", "test-player");

    expect(second.id).toBe(first.id);
    expect(second.username).toBe("test-player");
  });

  it("round-trips a ChessComCursor and a LichessCursor through jsonb", async () => {
    const chessComAccount = await upsertTrackedAccount(
      db,
      ownerId,
      "chess_com",
      "test-player",
    );
    const lichessAccount = await upsertTrackedAccount(
      db,
      ownerId,
      "lichess",
      "drnykterstein",
    );

    await updateTrackedAccountCursor(db, chessComAccount.id, {
      month: "2024/01",
      lastEndTime: 1704133706,
    });
    await updateTrackedAccountCursor(db, lichessAccount.id, { sinceMs: 1704067200000 });

    expect(await getTrackedAccountCursor(db, chessComAccount.id)).toEqual({
      month: "2024/01",
      lastEndTime: 1704133706,
    });
    expect(await getTrackedAccountCursor(db, lichessAccount.id)).toEqual({
      sinceMs: 1704067200000,
    });
  });

  it("listGames filters by account and orders by played_at desc", async () => {
    const account = await upsertTrackedAccount(db, ownerId, "chess_com", "test-player");
    await saveGames(
      db,
      [
        chessComGame({
          externalId: "1",
          movetextHash: "h1",
          playedAt: new Date("2024-01-01T00:00:00Z"),
        }),
        chessComGame({
          externalId: "2",
          movetextHash: "h2",
          playedAt: new Date("2024-01-02T00:00:00Z"),
        }),
      ],
      { userId: ownerId, accountId: account.id },
    );
    await saveGames(db, [pastedGame()], { userId: ownerId }); // unrelated, no account

    const rows = await listGames(db, { accountId: account.id });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.externalId).toBe("2");
  });
});
