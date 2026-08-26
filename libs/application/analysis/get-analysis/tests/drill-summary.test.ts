// @vitest-environment node
/**
 * The number the report's CTA shows.
 *
 * It is the one number in the product that can be caught lying: it sits
 * beside a button, and pressing the button serves the positions. If the
 * count and the queue disagree the user finds out immediately, which is
 * why the summary runs the same `seedsFor` triage runs rather than
 * counting categories a second way.
 */
import type { Database, StoredGradedPly } from "@velachess/db";
import {
  createRepertoire,
  createUser,
  games,
  saveAnalysis,
  upsertTrackedAccount,
} from "@velachess/db";
import { createTestDb, type TestDb } from "@velachess/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { drillSummaryFor } from "../drill-summary.ts";
import { triageAndSeed } from "../../../drills/seed-exercises/seed-exercises.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
/** After 1.e4, so Black is to move and d7d5 is legal. */
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function blunder(ply: number, fen: string, bestMove: string): StoredGradedPly {
  return {
    ply,
    fen,
    san: "a3",
    evalBefore: { cp: 0 },
    evalAfter: { cp: -400 },
    bestMove,
    category: "blunder",
    winChanceLoss: 0.4,
  };
}

let harness: TestDb;
let db: Database;
let userId: string;

async function gameWith(positions: StoredGradedPly[]): Promise<string> {
  const account = await upsertTrackedAccount(db, userId, "lichess", "player");
  const [game] = await db
    .insert(games)
    .values({
      userId,
      accountId: account.id,
      source: "lichess",
      whiteName: "player",
      blackName: "other",
      result: "*",
      hasClocks: false,
      rawPgn: "1. e4 e5 *",
      movetextHash: `summary-${Math.random()}`,
      perspective: "white",
    })
    .returning();

  await saveAnalysis(db, game!.id, {
    engineVersion: "test",
    depth: 12,
    positions,
  });
  return game!.id;
}

beforeEach(async () => {
  harness = await createTestDb();
  db = harness.db;
  userId = (await createUser(db)).id;
});

afterEach(async () => {
  await harness.close();
});

describe("drillSummaryFor", () => {
  it("counts the drillable plies before anything has been seeded", async () => {
    const gameId = await gameWith([blunder(1, START, "d2d4")]);

    expect(await drillSummaryFor(db, gameId)).toEqual({
      eligible: 1,
      seeded: 0,
      // The state the screen must not render as "nothing to drill".
      triaged: false,
    });
  });

  it("reports the game settled once triage has run", async () => {
    const gameId = await gameWith([blunder(1, START, "d2d4")]);
    await triageAndSeed(db, userId, { gameId });

    expect(await drillSummaryFor(db, gameId)).toEqual({
      eligible: 1,
      seeded: 1,
      triaged: true,
    });
  });

  it("calls a clean game settled rather than pending", async () => {
    // Nothing owed, so there is nothing to wait for — a spinner here would
    // never resolve.
    const gameId = await gameWith([
      { ...blunder(1, START, "d2d4"), category: "best", winChanceLoss: 0 },
    ]);

    expect(await drillSummaryFor(db, gameId)).toEqual({
      eligible: 0,
      seeded: 0,
      triaged: true,
    });
  });

  it("leaves the opponent's blunders out of the count", async () => {
    // Ply 2 is Black's and the user is White. Counting it would promise a
    // position the drill queue will never serve.
    const gameId = await gameWith([
      blunder(1, START, "d2d4"),
      blunder(2, AFTER_E4, "d7d5"),
    ]);

    expect((await drillSummaryFor(db, gameId)).eligible).toBe(1);
  });

  it("offers nothing for an imported game nobody was named in", async () => {
    // A PGN upload without a player name imports fine — perspective null,
    // no account provenance. Ownership is direct, so the summary answers
    // for it instead of treating it as nobody's.
    const [imported] = await db
      .insert(games)
      .values({
        userId,
        source: "pgn",
        whiteName: "a",
        blackName: "b",
        result: "*",
        hasClocks: false,
        rawPgn: "1. e4 *",
        movetextHash: "orphan-1",
      })
      .returning();

    expect(await drillSummaryFor(db, imported!.id)).toEqual({
      eligible: 0,
      seeded: 0,
      triaged: true,
    });
  });

  it("has nothing to offer before the game is analyzed", async () => {
    const account = await upsertTrackedAccount(db, userId, "lichess", "player");
    const [unanalyzed] = await db
      .insert(games)
      .values({
        userId,
        accountId: account.id,
        source: "lichess",
        whiteName: "player",
        blackName: "other",
        result: "*",
        hasClocks: false,
        rawPgn: "1. e4 *",
        movetextHash: "unanalyzed-1",
        perspective: "white",
      })
      .returning();

    expect(await drillSummaryFor(db, unanalyzed!.id)).toEqual({
      eligible: 0,
      seeded: 0,
      triaged: true,
    });
  });
});
