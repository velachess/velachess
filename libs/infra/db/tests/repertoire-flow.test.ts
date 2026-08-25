// @vitest-environment node
/**
 * E2E for cycle 0: every table, every constraint that carries a design
 * decision, and the full flow — user → repertoire → chapter (PGN) →
 * buildRepertoire → findDeviation → upsertJudgment → read back.
 */
import { parsePgn, replayMainline } from "@velachess/chess";
import { buildRepertoire, findDeviation } from "@velachess/repertoire";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@velachess/db";
import {
  addChapter,
  createRepertoire,
  createUser,
  deviations,
  games,
  getRepertoireWithChapters,
  listJudgmentsByGame,
  listJudgmentsByRepertoire,
  repertoireChapters,
  repertoires,
  trackedAccounts,
  upsertJudgment,
  upsertTrackedAccount,
  users,
} from "@velachess/db";

import { createTestDb } from "./test-db.ts";

const CHAPTER_PGN = "1. e4 e6 2. d4 d5 3. Nc3 *";

function insertGame(db: Database, movetextHash: string) {
  return db
    .insert(games)
    .values({
      source: "pgn",
      whiteName: "w",
      blackName: "b",
      result: "*",
      hasClocks: false,
      rawPgn: "1. e4 *",
      movetextHash,
    })
    .returning()
    .then(([g]) => g!);
}

function judge(gamePgn: string, chapterPgn = CHAPTER_PGN) {
  const repertoireGame = parsePgn(chapterPgn)[0]!;
  const built = buildRepertoire(repertoireGame).unwrap();
  const played = replayMainline(parsePgn(gamePgn)[0]!).unwrap();
  return findDeviation(built, played, "white");
}

const { db, close } = await createTestDb();

afterAll(() => close());

beforeEach(async () => {
  await db.delete(deviations);
  await db.delete(repertoireChapters);
  await db.delete(repertoires);
  await db.delete(games);
  await db.delete(trackedAccounts);
  await db.delete(users);
});

describe("users", () => {
  it("creates a user and enforces partial-unique email", async () => {
    const user = await createUser(db, { email: "a@b.com" });
    expect(user.id).toBeTruthy();

    await expect(createUser(db, { email: "a@b.com" })).rejects.toThrow();
    await expect(createUser(db)).resolves.toBeTruthy();
    await expect(createUser(db)).resolves.toBeTruthy();
  });

  it("a tracked account belongs to its user and dies with them", async () => {
    // CASCADE, not SET NULL: an unowned connection is not a thing any
    // more — the orphaned-games hole came from exactly that null.
    const user = await createUser(db);
    const account = await upsertTrackedAccount(db, user.id, "chess_com", "Yuri");
    expect(account.userId).toBe(user.id);

    await db.delete(users).where(eq(users.id, user.id));
    const [after] = await db
      .select()
      .from(trackedAccounts)
      .where(eq(trackedAccounts.id, account.id));
    expect(after).toBeUndefined();
  });
});

describe("repertoires and chapters", () => {
  it("rejects a repertoire with a nonexistent owner", async () => {
    await expect(
      createRepertoire(db, {
        userId: "00000000-0000-0000-0000-000000000000",
        name: "x",
        color: "white",
      }),
    ).rejects.toThrow();
  });

  it("round-trips repertoire + ordered chapters; duplicate sortOrder fails", async () => {
    const user = await createUser(db);
    const rep = await createRepertoire(db, {
      userId: user.id,
      name: "White",
      color: "white",
    });
    await addChapter(db, {
      repertoireId: rep.id,
      name: "B",
      sortOrder: 2,
      pgn: CHAPTER_PGN,
      startingFen: null,
    });
    await addChapter(db, {
      repertoireId: rep.id,
      name: "A",
      sortOrder: 1,
      pgn: CHAPTER_PGN,
      startingFen: null,
    });

    const loaded = await getRepertoireWithChapters(db, user.id, rep.id);
    expect(loaded?.chapters.map((c) => c.name)).toEqual(["A", "B"]);

    await expect(
      addChapter(db, {
        repertoireId: rep.id,
        name: "C",
        sortOrder: 1,
        pgn: CHAPTER_PGN,
        startingFen: null,
      }),
    ).rejects.toThrow();
  });

  it("deleting a user cascades to repertoires and chapters", async () => {
    const user = await createUser(db);
    const rep = await createRepertoire(db, {
      userId: user.id,
      name: "White",
      color: "white",
    });
    await addChapter(db, {
      repertoireId: rep.id,
      name: "A",
      sortOrder: 1,
      pgn: CHAPTER_PGN,
      startingFen: null,
    });

    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(repertoires)).toHaveLength(0);
    expect(await db.select().from(repertoireChapters)).toHaveLength(0);
  });
});

describe("judgments (deviations table)", () => {
  async function setup() {
    const user = await createUser(db);
    const rep = await createRepertoire(db, {
      userId: user.id,
      name: "White",
      color: "white",
    });
    const chapter = await addChapter(db, {
      repertoireId: rep.id,
      name: "French",
      sortOrder: 1,
      pgn: CHAPTER_PGN,
      startingFen: null,
    });
    const game = await insertGame(db, `h-${Math.random()}`);
    const ctx = {
      gameId: game.id,
      repertoireId: rep.id,
      chapterId: chapter.id,
      repertoireName: rep.name,
      chapterName: chapter.name,
    };
    return { user, rep, chapter, game, ctx };
  }

  it("persists all four judgment types with correct event columns", async () => {
    const cases = [
      { pgn: "1. e4 e6 *", type: "completed", inBookPlies: 2, playedSan: null },
      { pgn: "1. e4 e6 2. Nf3 *", type: "deviation", inBookPlies: 2, playedSan: "Nf3" },
      { pgn: "1. e4 c5 *", type: "gap", inBookPlies: 1, playedSan: "c5" },
      {
        pgn: "1. e4 e6 2. d4 d5 3. Nc3 Nf6 *",
        type: "book-ended",
        inBookPlies: 5,
        playedSan: "Nf6",
      },
    ] as const;

    for (const c of cases) {
      const { ctx } = await setup();
      const saved = await upsertJudgment(db, ctx, judge(c.pgn));
      expect(saved.type).toBe(c.type);
      expect(saved.inBookPlies).toBe(c.inBookPlies);
      expect(saved.playedSan).toBe(c.playedSan);
      if (c.type === "deviation") expect(saved.expectedSans).toEqual(["d4"]);
      else expect(saved.expectedSans).toBeNull();
      if (c.type === "completed") {
        expect(saved.ply).toBeNull();
        expect(saved.positionKey).toBeNull();
      }
    }
  });

  it("re-judging the same (game, repertoire) upserts — one row, updated", async () => {
    const { ctx } = await setup();
    await upsertJudgment(db, ctx, judge("1. e4 e6 *"));
    const second = await upsertJudgment(db, ctx, judge("1. e4 e6 2. Nf3 *"));

    const rows = await listJudgmentsByGame(db, ctx.gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(second.id);
    expect(rows[0]!.type).toBe("deviation");
  });

  it("deleting the repertoire keeps history readable via snapshots", async () => {
    const { ctx, rep } = await setup();
    await upsertJudgment(db, ctx, judge("1. e4 e6 2. Nf3 *"));

    await db.delete(repertoires).where(eq(repertoires.id, rep.id));
    const rows = await listJudgmentsByGame(db, ctx.gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.repertoireId).toBeNull();
    expect(rows[0]!.chapterId).toBeNull();
    expect(rows[0]!.repertoireNameSnapshot).toBe("White");
    expect(rows[0]!.chapterNameSnapshot).toBe("French");
  });

  it("deleting the game cascades the judgment", async () => {
    const { ctx, game } = await setup();
    await upsertJudgment(db, ctx, judge("1. e4 e6 *"));

    await db.delete(games).where(eq(games.id, game.id));
    expect(await db.select().from(deviations)).toHaveLength(0);
  });

  it("engine columns exist and accept the analysis cycle's payload", async () => {
    const { ctx } = await setup();
    const saved = await upsertJudgment(db, ctx, judge("1. e4 e6 2. Nf3 *"));
    expect(saved.cpLoss).toBeNull();
    expect(saved.engineCategory).toBeNull();
    expect(saved.drillable).toBe(false);

    await db
      .update(deviations)
      .set({ cpLoss: 63, engineCategory: "inaccuracy", drillable: true })
      .where(eq(deviations.id, saved.id));
    const [after] = await db.select().from(deviations).where(eq(deviations.id, saved.id));
    expect(after?.engineCategory).toBe("inaccuracy");
  });
});

describe("full round-trip (cycle 0 acceptance)", () => {
  it("user → repertoire → chapter PGN → read back → tree → findDeviation → persisted judgment", async () => {
    const user = await createUser(db, { displayName: "Yuri" });
    const rep = await createRepertoire(db, {
      userId: user.id,
      name: "My White openings",
      color: "white",
    });
    await addChapter(db, {
      repertoireId: rep.id,
      name: "French",
      sortOrder: 1,
      pgn: CHAPTER_PGN,
      startingFen: null,
    });

    const loaded = await getRepertoireWithChapters(db, user.id, rep.id);
    expect(loaded).not.toBeNull();
    const chapter = loaded!.chapters[0]!;

    const built = buildRepertoire(parsePgn(chapter.pgn)[0]!).unwrap();
    const played = replayMainline(parsePgn("1. e4 e6 2. Nf3 d5 *")[0]!).unwrap();
    const result = findDeviation(built, played, loaded!.color);

    expect(result.event?.type).toBe("deviation");

    const game = await insertGame(db, "acceptance");
    const saved = await upsertJudgment(
      db,
      {
        gameId: game.id,
        repertoireId: rep.id,
        chapterId: chapter.id,
        repertoireName: rep.name,
        chapterName: chapter.name,
      },
      result,
    );

    expect(saved.type).toBe("deviation");
    expect(saved.playedSan).toBe("Nf3");
    expect(saved.expectedSans).toEqual(["d4"]);
    expect(saved.inBookPlies).toBe(2);

    const byRepertoire = await listJudgmentsByRepertoire(db, rep.id);
    expect(byRepertoire).toHaveLength(1);

    const count = await db.execute(sql`select count(*)::int as n from deviations`);
    expect(
      (count as unknown as { rows?: { n: number }[] }).rows?.[0]?.n ??
        (count as { n: number }[])[0]?.n,
    ).toBe(1);
  });
});
