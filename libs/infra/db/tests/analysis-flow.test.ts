// @vitest-environment node
/** Analysis cache persistence. Queue lifecycle belongs to pg-boss and is tested in `libs/infra/queue`. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";
import {
  gameAnalyses,
  games,
  getAnalysis,
  saveAnalysis,
  users,
} from "@velachess/infra-db";

import { createTestDb, createUserRow } from "./test-db.ts";

const { db, close } = await createTestDb();

afterAll(() => close());

let ownerId: string;

beforeEach(async () => {
  await db.delete(gameAnalyses);
  await db.delete(games);
  await db.delete(users);
  ownerId = await createUserRow(db);
});

function insertGame(database: Database, rawPgn: string, movetextHash: string) {
  return database
    .insert(games)
    .values({
      userId: ownerId,
      source: "pgn",
      whiteName: "w",
      blackName: "b",
      result: "*",
      hasClocks: false,
      rawPgn,
      movetextHash,
    })
    .returning()
    .then(([g]) => g!);
}

describe("analysis cache", () => {
  it("saveAnalysis upserts; getAnalysis returns the report or null", async () => {
    const game = await insertGame(db, "1. e4 *", "c1");
    expect(await getAnalysis(db, game.id)).toBeNull();

    const positions = [
      {
        ply: 1,
        fen: "f",
        san: "e4",
        evalBefore: { cp: 20 },
        evalAfter: { cp: 25 },
        bestMove: "e2e4",
        category: "best",
        winChanceLoss: 0,
      },
    ] as never;
    await saveAnalysis(db, game.id, { engineVersion: "test-1", depth: 8, positions });
    await saveAnalysis(db, game.id, { engineVersion: "test-2", depth: 8, positions });

    const cached = await getAnalysis(db, game.id);
    expect(cached?.engineVersion).toBe("test-2");
    expect((await db.select().from(gameAnalyses)).length).toBe(1);
  });
});
