// @vitest-environment node
/**
 * Which provenance gets to explain an exercise.
 *
 * Only interesting because an exercise can hold both: deviating from your
 * book in a position and later blundering in the same position is one
 * exercise with two sources. The screen has to pick a sentence, and
 * picking the wrong one describes a move the drill is not checking.
 */
import type { Database } from "@velachess/db";
import {
  createUser,
  deviations,
  exerciseSources,
  drillContextOf,
  games,
  listExercisesByUser,
  upsertExercise,
} from "@velachess/db";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@velachess/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

let harness: TestDb;
let db: Database;
let userId: string;

beforeEach(async () => {
  harness = await createTestDb();
  db = harness.db;
  userId = (await createUser(db)).id;
});

afterEach(async () => {
  await harness.close();
});

async function aGame(): Promise<string> {
  const [game] = await db
    .insert(games)
    .values({
      source: "pgn",
      whiteName: "w",
      blackName: "b",
      result: "*",
      hasClocks: false,
      rawPgn: "1. e4 *",
      movetextHash: `origin-${Math.random()}`,
    })
    .returning();
  return game!.id;
}

describe("drillContextOf", () => {
  it("names the game and move when the engine is the only source", async () => {
    const gameId = await aGame();
    const exercise = await upsertExercise(db, userId, {
      positionKey: EPD,
      expectedSans: ["d4"],
      origin: { kind: "engine-blunder", gameId, ply: 7 },
    });

    expect(await drillContextOf(db, exercise.id)).toEqual({
      origin: "engine-blunder",
      playedSan: null,
      // Ply 7 is move 4 — people count whole moves, engines count halves,
      // and a label saying "move 7" would not match the board they saw.
      label: "Move 4 vs b",
    });
  });

  it("lets the repertoire explain an exercise that has both", async () => {
    // expectedSans holds the preparation once a repertoire seed lands, so
    // the engine's sentence would name a move the drill does not accept.
    const gameId = await aGame();
    const exercise = await upsertExercise(db, userId, {
      positionKey: EPD,
      expectedSans: ["d4"],
      origin: { kind: "engine-blunder", gameId, ply: 1 },
    });
    const [deviation] = await db
      .insert(deviations)
      .values({
        gameId,
        repertoireNameSnapshot: "Book",
        chapterNameSnapshot: "Chapter",
        type: "deviation",
        inBookPlies: 1,
        ply: 1,
        positionKey: EPD,
        expectedSans: ["d4"],
        playedSan: "e4",
      })
      .returning();

    await upsertExercise(db, userId, {
      positionKey: EPD,
      expectedSans: ["d4"],
      origin: { kind: "repertoire-deviation", deviationId: deviation!.id },
    });

    const context = await drillContextOf(db, exercise.id);
    expect(context).toEqual({
      origin: "repertoire-deviation",
      playedSan: "e4",
      label: "Book — Chapter",
    });
  });

  it("keeps one exercise when both origins name the same position", async () => {
    // The requirement in one place: two sources create drills, and the
    // same position from both is still one drill. It held only because
    // both origins key the position the same way — an engine seed keyed
    // by raw FEN and a repertoire seed keyed by EPD produced two rows
    // that no unique index could catch, since the keys differed.
    const gameId = await aGame();
    const [deviation] = await db
      .insert(deviations)
      .values({
        gameId,
        repertoireNameSnapshot: "Book",
        chapterNameSnapshot: "Chapter",
        type: "deviation",
        inBookPlies: 1,
        ply: 1,
        positionKey: EPD,
        expectedSans: ["d4"],
      })
      .returning();

    await upsertExercise(db, userId, {
      positionKey: EPD,
      expectedSans: ["d4"],
      origin: { kind: "engine-blunder", gameId, ply: 1 },
    });
    await upsertExercise(db, userId, {
      positionKey: EPD,
      expectedSans: ["d4"],
      origin: { kind: "repertoire-deviation", deviationId: deviation!.id },
    });

    const mine = await listExercisesByUser(db, userId);
    expect(mine).toHaveLength(1);

    // One drill, but both reasons survive — the provenance is what the
    // report links back to, so collapsing it would lose the trail.
    const sources = await db
      .select()
      .from(exerciseSources)
      .where(eq(exerciseSources.exerciseId, mine[0]!.id));
    expect(sources.map((s) => s.origin).toSorted()).toEqual([
      "engine-blunder",
      "repertoire-deviation",
    ]);
  });

  it("stays quiet for an exercise with no source at all", async () => {
    expect(await drillContextOf(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
