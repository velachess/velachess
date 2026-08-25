// @vitest-environment node
/**
 * Cycle-6 read-model semantics: judgments accumulate per repertoire, the
 * game list picks the most actionable judgment, extraction chapter swaps
 * are full replacements, and deleting a repertoire keeps history.
 */
import type { NormalizedGame } from "@velachess/platforms";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DeviationResult } from "@velachess/repertoire";
import {
  addChapter,
  createRepertoire,
  deleteRepertoire,
  deviations as deviationsTable,
  ensureUser,
  findRepertoireOfColor,
  getRepertoireWithChapters,
  listUnjudgedGames,
  markRepertoireManual,
  replaceChapters,
  saveGames,
  upsertJudgment,
  upsertTrackedAccount,
} from "@velachess/db";
import { listGamesWithStatus } from "@velachess/application/accounts/list-account-games/list-account-games";
import { eq } from "drizzle-orm";

import { createTestDb } from "./test-db.ts";

const { db, close } = await createTestDb();

const completedResult: DeviationResult = { inBookPlies: 4, event: null };
const deviationResult: DeviationResult = {
  inBookPlies: 2,
  event: {
    type: "deviation",
    ply: 3,
    positionKey: "key-3",
    actualMove: { from: 12, to: 28 },
    actualSan: "g4",
    expectedMoves: [{ move: { from: 11, to: 27 }, san: "d4" }],
  },
};

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

let userId: string;
let accountId: string;
let gameId: string;
let repA: { id: string; name: string };
let repB: { id: string; name: string };
let chapterA: string;
let chapterB: string;

beforeAll(async () => {
  const user = await ensureUser(db, "status-flow@test.local");
  userId = user.id;
  const account = await upsertTrackedAccount(db, userId, "chess_com", "looper");
  accountId = account.id;

  await saveGames(db, [syncedGame("1001")], { accountId });
  const [game] = await listGamesWithStatus(db, accountId);
  gameId = game!.id;

  repA = await createRepertoire(db, { userId, name: "A", color: "white" });
  repB = await createRepertoire(db, { userId, name: "B", color: "white" });
  chapterA = (
    await addChapter(db, {
      repertoireId: repA.id,
      name: "a",
      pgn: "1. e4 *",
      sortOrder: 0,
    })
  ).id;
  chapterB = (
    await addChapter(db, {
      repertoireId: repB.id,
      name: "b",
      pgn: "1. e4 *",
      sortOrder: 0,
    })
  ).id;
});

afterAll(close);

describe("per-repertoire judgment semantics", () => {
  it("a game judged by A is still pending for B — and settles per repertoire", async () => {
    expect(await listUnjudgedGames(db, userId, repA.id)).toHaveLength(1);

    await upsertJudgment(
      db,
      {
        gameId,
        repertoireId: repA.id,
        chapterId: chapterA,
        repertoireName: "A",
        chapterName: "a",
      },
      completedResult,
    );

    expect(await listUnjudgedGames(db, userId, repA.id)).toHaveLength(0);
    expect(await listUnjudgedGames(db, userId, repB.id)).toHaveLength(1); // B still reaches it

    await upsertJudgment(
      db,
      {
        gameId,
        repertoireId: repB.id,
        chapterId: chapterB,
        repertoireName: "B",
        chapterName: "b",
      },
      deviationResult,
    );
    expect(await listUnjudgedGames(db, userId, repB.id)).toHaveLength(0);
  });

  it("the game list shows ONE row per game and prefers the deviation judgment", async () => {
    const rows = await listGamesWithStatus(db, accountId);
    expect(rows).toHaveLength(1); // two judgments, no fan-out
    expect(rows[0]!.judgmentType).toBe("deviation");
    expect(rows[0]!.judgmentPly).toBe(3);
  });
});

describe("extraction persistence primitives", () => {
  it("findRepertoireOfColor ignores the name and prefers confirmed prep", async () => {
    // Renaming a book must not grow a second one: identity is the
    // colour. Among candidates the oldest wins; confirmed preparation
    // outranks any of them, so extraction can refuse to overwrite it.
    const older = await createRepertoire(db, {
      userId,
      name: "Renamed by the user",
      color: "black",
      source: "extracted",
    });
    const newer = await createRepertoire(db, {
      userId,
      name: "Something else",
      color: "black",
      source: "extracted",
    });
    expect((await findRepertoireOfColor(db, userId, "black"))!.id).toBe(older.id);

    await markRepertoireManual(db, newer.id);
    expect((await findRepertoireOfColor(db, userId, "black"))!.id).toBe(newer.id);

    await deleteRepertoire(db, userId, older.id);
    await deleteRepertoire(db, userId, newer.id);
    expect(await findRepertoireOfColor(db, userId, "black")).toBeNull();
  });

  it("replaceChapters swaps the whole book", async () => {
    await replaceChapters(db, repB.id, [
      { name: "New main", pgn: "1. d4 d5 *" },
      { name: "Sideline", pgn: "1. d4 Nf6 *" },
    ]);
    const loaded = await getRepertoireWithChapters(db, userId, repB.id);
    expect(loaded!.chapters.map((c) => c.name)).toEqual(["New main", "Sideline"]);
    expect(loaded!.chapters.map((c) => c.sortOrder)).toEqual([0, 1]);

    await replaceChapters(db, repB.id, [{ name: "Only", pgn: "1. c4 *" }]);
    expect((await getRepertoireWithChapters(db, userId, repB.id))!.chapters).toHaveLength(
      1,
    );
  });

  it("deleting a repertoire keeps judgment history (null link, snapshots stay)", async () => {
    await deleteRepertoire(db, userId, repB.id);
    const rows = await db
      .select()
      .from(deviationsTable)
      .where(eq(deviationsTable.gameId, gameId));
    const orphan = rows.find((r) => r.repertoireNameSnapshot === "B");
    expect(orphan).toBeDefined();
    expect(orphan!.repertoireId).toBeNull();
    expect(orphan!.type).toBe("deviation");
  });
});
