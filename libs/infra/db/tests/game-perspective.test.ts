// @vitest-environment node
/**
 * A synced game stores null in `games.perspective`, the normalizer seeing a
 * PGN rather than an identity, so the read derives the seat from the
 * provenance account. Serving the raw null made the review screen fall back
 * to handles the browser happened to remember, seating the opponent at the
 * bottom on any device that never ran the import.
 */
import type { NormalizedGame } from "@velachess/infra-platforms";
import { afterAll, beforeEach, expect, it } from "vitest";

import {
  createUser,
  games,
  getGameForUser,
  listGamesWithStatusForAccount,
  saveGames,
  trackedAccounts,
  insertTrackedAccount,
} from "@velachess/infra-db";

import { createTestDb } from "./test-db.ts";

const { db, close } = await createTestDb();

let ownerId: string;

beforeEach(async () => {
  await db.delete(games);
  await db.delete(trackedAccounts);
  ownerId = (await createUser(db)).id;
});

afterAll(close);

function syncedGame(overrides: Partial<NormalizedGame> = {}): NormalizedGame {
  return {
    source: "chess_com",
    externalId: "200000001",
    externalUrl: "https://www.chess.com/game/live/200000001",
    // What a sync stores: the provider hands over a PGN, not an identity.
    perspective: null,
    white: { name: "Opponent", rating: 1500 },
    black: { name: "yurimutti", rating: 1480 },
    result: "0-1",
    playedAt: new Date("2026-10-09T18:00:00Z"),
    timeControl: { initialSeconds: 180, incrementSeconds: 0, raw: "180" },
    opening: { eco: "B23" },
    termination: "yurimutti won by resignation",
    hasClocks: true,
    rawPgn: '[Event "Live Chess"]\n\n1. e4 c5 0-1\n',
    movetextHash: "perspective-hash-1",
    ...overrides,
  };
}

/** `saveGames` answers with a count, so the id comes off the table. */
async function onlyGameId() {
  const [row] = await db.select({ id: games.id }).from(games);
  return row!.id;
}

async function openOnlyGame(username: string, game: NormalizedGame) {
  const account = (await insertTrackedAccount(db, ownerId, "chess_com", username))!;
  await saveGames(db, [game], { userId: ownerId, accountId: account.id });
  return getGameForUser(db, ownerId, await onlyGameId());
}

it("seats you as Black when the account played Black", async () => {
  const row = await openOnlyGame("yurimutti", syncedGame());

  expect(row?.perspective).toBe("black");
});

it("seats you as White when the account played White", async () => {
  const row = await openOnlyGame(
    "Opponent",
    syncedGame({ white: { name: "Opponent", rating: 1500 } }),
  );

  expect(row?.perspective).toBe("white");
});

it("matches the handle whatever case the provider returns it in", async () => {
  // Chess.com answers in display casing, not the casing anyone typed when
  // connecting.
  const row = await openOnlyGame(
    "YuriMutti",
    syncedGame({ black: { name: "YURIMUTTI", rating: 1480 } }),
  );

  expect(row?.perspective).toBe("black");
});

it("keeps the seat a manual import already resolved", async () => {
  // A pasted PGN states the seat outright, and has no account to derive
  // from.
  await saveGames(
    db,
    [
      syncedGame({
        source: "pgn",
        externalId: null,
        externalUrl: null,
        perspective: "white",
        movetextHash: "perspective-hash-pgn",
      }),
    ],
    { userId: ownerId },
  );

  const row = await getGameForUser(db, ownerId, await onlyGameId());

  expect(row?.perspective).toBe("white");
});

it("answers null when nothing attributes the game", async () => {
  // An unattributed PGN: null lets the screen say it does not know rather
  // than claim a seat.
  await saveGames(
    db,
    [
      syncedGame({
        source: "pgn",
        externalId: null,
        externalUrl: null,
        movetextHash: "perspective-hash-orphan",
      }),
    ],
    { userId: ownerId },
  );

  const row = await getGameForUser(db, ownerId, await onlyGameId());

  expect(row?.perspective).toBeNull();
});

it("still refuses a game that belongs to someone else", async () => {
  // The join is provenance only: ownership is the row's own user_id and
  // must not widen.
  const account = (await insertTrackedAccount(db, ownerId, "chess_com", "yurimutti"))!;
  await saveGames(db, [syncedGame()], { userId: ownerId, accountId: account.id });
  const gameId = await onlyGameId();
  const stranger = (await createUser(db)).id;

  expect(await getGameForUser(db, stranger, gameId)).toBeNull();
});

it("the account-scoped list resolves the seat too, not just the single read", async () => {
  // The second reader of the same rule: this list served the raw column, so
  // every synced game answered "unknown" while `getGameForUser` answered
  // correctly for the same row.
  const account = (await insertTrackedAccount(db, ownerId, "chess_com", "yurimutti"))!;
  await saveGames(db, [syncedGame()], { userId: ownerId, accountId: account.id });

  const [row] = await listGamesWithStatusForAccount(db, account.id);

  expect(row?.perspective).toBe("black");
});

it("the account-scoped list keeps a seat the stored column already holds", async () => {
  const account = (await insertTrackedAccount(db, ownerId, "chess_com", "nobody-here"))!;
  await saveGames(
    db,
    [syncedGame({ perspective: "white", movetextHash: "perspective-hash-stored" })],
    { userId: ownerId, accountId: account.id },
  );

  const [row] = await listGamesWithStatusForAccount(db, account.id);

  expect(row?.perspective).toBe("white");
});
