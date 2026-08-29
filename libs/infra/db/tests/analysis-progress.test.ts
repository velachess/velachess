// @vitest-environment node
/**
 * The running commentary, separately from the report.
 *
 * These rows exist to be read by a connection that is not the one writing
 * them, which is why they are committed one at a time and never inside the
 * transaction that saves the report. What is pinned here is the part that
 * makes them safe to read: a retried run does not duplicate, a crashed run
 * does not blend into its replacement, and the report clears them.
 */
import type { GradedPly } from "@velachess/analysis";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@velachess/db";
import {
  analysisProgress,
  appendProgress,
  clearProgress,
  countProgress,
  games,
  listProgress,
  users,
} from "@velachess/db";

import { createTestDb, createUserRow } from "./test-db.ts";

const { db, close } = await createTestDb();

afterAll(() => close());

let userId: string;

beforeEach(async () => {
  await db.delete(analysisProgress);
  await db.delete(games);
  await db.delete(users);
  userId = await createUserRow(db);
});

function insertGame(database: Database) {
  return database
    .insert(games)
    .values({
      userId,
      source: "pgn",
      whiteName: "w",
      blackName: "b",
      result: "*",
      hasClocks: false,
      rawPgn: "1. e4 *",
      movetextHash: randomUUID(),
    })
    .returning();
}

function aPosition(ply: number): GradedPly {
  return {
    ply,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    san: "e4",
    evalBefore: { cp: 0 },
    evalAfter: { cp: 20 },
    bestMove: "e2e4",
    category: "best",
    winChanceLoss: 0,
  };
}

async function aGameId() {
  const [game] = await insertGame(db);
  return game!.id;
}

describe("analysis progress", () => {
  it("reads back what a run has graded so far, in order", async () => {
    const gameId = await aGameId();
    const runId = randomUUID();

    // Deliberately out of order — the engine is sequential, but a reader
    // must not depend on insertion order to get the game's order.
    for (const index of [1, 0, 2]) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await appendProgress(db, {
        runId,
        gameId,
        index,
        total: 7,
        position: aPosition(index + 1),
      });
    }

    const progress = await listProgress(db, gameId);
    expect(progress.map((row) => row.index)).toEqual([0, 1, 2]);
    expect(await countProgress(db, gameId)).toEqual({ graded: 3, total: 7 });
  });

  it("says nothing before a run has reported anything", async () => {
    // Not zero: "no run has spoken" and "a run has graded none" are
    // different answers, and a bar pinned at 0% claims the second.
    const gameId = await aGameId();

    expect(await listProgress(db, gameId)).toEqual([]);
    expect(await countProgress(db, gameId)).toBeNull();
  });

  it("counts a replayed index once, so a retried job cannot inflate progress", async () => {
    const gameId = await aGameId();
    const runId = randomUUID();
    const entry = { runId, gameId, index: 0, total: 7, position: aPosition(1) };

    await appendProgress(db, entry);
    await appendProgress(db, entry);

    expect(await countProgress(db, gameId)).toEqual({ graded: 1, total: 7 });
  });

  it("follows the newest run, never a crashed one's leftovers", async () => {
    // pg-boss retries. The dead attempt's rows are still in the table and
    // must not be counted alongside the attempt that replaced it.
    const gameId = await aGameId();
    const crashed = randomUUID();
    const live = randomUUID();

    for (const index of [0, 1, 2, 3, 4]) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await appendProgress(db, {
        runId: crashed,
        gameId,
        index,
        total: 7,
        position: aPosition(index + 1),
      });
    }
    await appendProgress(db, {
      runId: live,
      gameId,
      index: 0,
      total: 7,
      position: aPosition(1),
    });

    // One, not six: the newer run has only graded its first move.
    expect(await countProgress(db, gameId)).toEqual({ graded: 1, total: 7 });
    expect(await listProgress(db, gameId)).toHaveLength(1);
  });

  it("is discarded once the report lands", async () => {
    const gameId = await aGameId();
    await appendProgress(db, {
      runId: randomUUID(),
      gameId,
      index: 0,
      total: 7,
      position: aPosition(1),
    });

    await clearProgress(db, gameId);

    expect(await countProgress(db, gameId)).toBeNull();
  });
});
