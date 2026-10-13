// @vitest-environment node
import type { NormalizedGame } from "@velachess/infra-platforms";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createUser,
  findTrackedAccountByPlatform,
  games,
  getGame,
  getTrackedAccount,
  listGamesPage,
  listGamesWithStatusForAccount,
  saveGames,
  trackedAccounts,
  updateTrackedAccountCursor,
  insertTrackedAccount,
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

/** Distinct games, as many as asked: a unique external id and movetext per row. */
const manyGames = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    chessComGame({ externalId: String(i), movetextHash: `hash-${i}` }),
  );

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
    const account = (await insertTrackedAccount(
      db,
      ownerId,
      "chess_com",
      "Test-Player",
    ))!;
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
    const accountA = (await insertTrackedAccount(
      db,
      ownerId,
      "chess_com",
      "Test-Player",
    ))!;
    const accountB = (await insertTrackedAccount(db, other, "chess_com", "Test-Player"))!;

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
      listGamesWithStatusForAccount(db, accountA.id),
      listGamesWithStatusForAccount(db, accountB.id),
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

  it("listGamesPage's total matches the real row count on a full page, a partial last page, and a past-the-end page", async () => {
    await saveGames(db, manyGames(30), { userId: ownerId });

    const full = await listGamesPage(db, ownerId, {}, { page: 1, pageSize: 25 });
    expect(full.rows).toHaveLength(25);
    expect(full.total).toBe(30);

    const tail = await listGamesPage(db, ownerId, {}, { page: 2, pageSize: 25 });
    expect(tail.rows).toHaveLength(5);
    expect(tail.total).toBe(30);

    // Past the last page: no rows, and the total still counts every match.
    const pastEnd = await listGamesPage(db, ownerId, {}, { page: 5, pageSize: 25 });
    expect(pastEnd.rows).toHaveLength(0);
    expect(pastEnd.total).toBe(30);

    const noMatches = await listGamesPage(db, ownerId, { color: "white" });
    expect(noMatches.rows).toHaveLength(0);
    expect(noMatches.total).toBe(0);
  });

  it("two users importing the same pasted PGN each keep their own copy", async () => {
    // Ownership is per user: movetext dedup must not leak one user's
    // paste into another's library as an invisible skip.
    const other = (await createUser(db)).id;
    const mine = await saveGames(db, [pastedGame()], { userId: ownerId });
    const theirs = await saveGames(db, [pastedGame()], { userId: other });

    expect(mine.inserted).toBe(1);
    expect(theirs.inserted).toBe(1);
    expect((await listGamesPage(db, ownerId)).rows).toHaveLength(1);
    expect((await listGamesPage(db, other)).rows).toHaveLength(1);
  });

  it("a batch containing an intra-statement duplicate only inserts one row", async () => {
    const result = await saveGames(db, [pastedGame(), pastedGame()], {
      userId: ownerId,
    });
    expect(result.inserted).toBe(1);
  });

  it("saveGames writes 10,000 games, and a re-run inserts none", async () => {
    const opts = { userId: ownerId };

    expect(await saveGames(db, manyGames(10_000), opts)).toEqual({ inserted: 10_000 });
    expect(await saveGames(db, manyGames(10_000), opts)).toEqual({ inserted: 0 });
    expect(await db.$count(games)).toBe(10_000);
  });

  it.each([499, 500, 501])(
    "saveGames counts every row across a batch edge (%i games)",
    async (count) => {
      expect(await saveGames(db, manyGames(count), { userId: ownerId })).toEqual({
        inserted: count,
      });
    },
  );

  it("a failing batch rejects and keeps the batches already written", async () => {
    const bad = chessComGame({
      externalId: "bad",
      movetextHash: "hash-bad",
      source: "bogus" as NormalizedGame["source"],
    });

    await expect(
      saveGames(db, [...manyGames(500), bad], { userId: ownerId }),
    ).rejects.toThrow();
    expect(await db.$count(games)).toBe(500);
  });

  it("deleting a tracked account leaves its games with account_id set to null", async () => {
    const account = (await insertTrackedAccount(
      db,
      ownerId,
      "chess_com",
      "Test-Player",
    ))!;
    await saveGames(db, [chessComGame()], {
      userId: ownerId,
      accountId: account.id,
    });

    await db.delete(trackedAccounts).where(eq(trackedAccounts.id, account.id));

    // `account_id` is `on delete set null`, so the game outlives its
    // provenance. Read the full row — the list projections drop the column.
    const [listed] = (await listGamesPage(db, ownerId)).rows;
    const row = await getGame(db, listed!.id);
    expect(row?.accountId).toBeNull();
  });

  it("insertTrackedAccount lowercases the handle and refuses a second row per provider", async () => {
    const userId = (await createUser(db)).id;
    const first = await insertTrackedAccount(db, userId, "chess_com", "Test-Player");
    const second = await insertTrackedAccount(db, userId, "chess_com", "other-player");

    expect(first?.username).toBe("test-player");
    expect(second).toBeNull();
    expect((await findTrackedAccountByPlatform(db, userId, "chess_com"))?.id).toBe(
      first?.id,
    );
  });

  it("round-trips a ChessComCursor and a LichessCursor through jsonb", async () => {
    const chessComAccount = (await insertTrackedAccount(
      db,
      ownerId,
      "chess_com",
      "test-player",
    ))!;
    const lichessAccount = (await insertTrackedAccount(
      db,
      ownerId,
      "lichess",
      "drnykterstein",
    ))!;

    await updateTrackedAccountCursor(db, chessComAccount.id, {
      month: "2024/01",
      lastEndTime: 1704133706,
    });
    await updateTrackedAccountCursor(db, lichessAccount.id, { sinceMs: 1704067200000 });

    // Read back the way production does: the sync slice takes the whole
    // row and validates `syncCursor` against its platform's schema.
    expect((await getTrackedAccount(db, chessComAccount.id))?.syncCursor).toEqual({
      month: "2024/01",
      lastEndTime: 1704133706,
    });
    expect((await getTrackedAccount(db, lichessAccount.id))?.syncCursor).toEqual({
      sinceMs: 1704067200000,
    });
  });

  it("the account list filters by account and orders by played_at desc", async () => {
    const account = (await insertTrackedAccount(
      db,
      ownerId,
      "chess_com",
      "test-player",
    ))!;
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
    // Unrelated to the account above: no accountId, just the owner.
    await saveGames(db, [pastedGame()], { userId: ownerId });

    const rows = await listGamesWithStatusForAccount(db, account.id);
    expect(rows).toHaveLength(2);
    // Newest first: the 2024-01-02 game, not the 2024-01-01 one.
    expect(rows[0]?.playedAt).toEqual(new Date("2024-01-02T00:00:00Z"));
  });
});
