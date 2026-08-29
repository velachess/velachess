// @vitest-environment node
/**
 * The counts the drill screen renders a choice from.
 *
 * `/drill/next` hands over one exercise, which is enough to practise and
 * not enough to decide whether to start. Everything here is about what a
 * person sees before pressing anything.
 */
import type { Database } from "@velachess/db";
import {
  countDrillQueue,
  createUser,
  deviations,
  games,
  saveCard,
  upsertExercise,
} from "@velachess/db";
import type { CardState } from "@velachess/scheduler";
import { createTestDb, type TestDb } from "@velachess/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const EPD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
const OTHER_EPD = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -";
const DAY_MS = 86_400_000;

/** A scheduled card, with only the field these counts read set on purpose. */
function cardDue(due: Date): CardState {
  return {
    due,
    stability: 1,
    difficulty: 5,
    scheduledDays: 1,
    elapsedDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    phase: "review",
    lastReview: new Date(due.getTime() - DAY_MS),
  };
}

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
      userId,
      source: "pgn",
      whiteName: "w",
      blackName: "b",
      result: "*",
      hasClocks: false,
      rawPgn: "1. e4 *",
      movetextHash: `queue-${Math.random()}`,
    })
    .returning();
  return game!.id;
}

async function engineDrill(positionKey: string) {
  return upsertExercise(db, userId, {
    positionKey,
    expectedSans: ["d4"],
    origin: { kind: "engine-blunder", gameId: await aGame(), ply: 1 },
  });
}

async function repertoireDrill(positionKey: string) {
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
      positionKey,
      expectedSans: ["d4"],
    })
    .returning();
  return upsertExercise(db, userId, {
    positionKey,
    expectedSans: ["d4"],
    origin: { kind: "repertoire-deviation", deviationId: deviation!.id },
  });
}

describe("countDrillQueue", () => {
  it("has nothing to offer a user with no drills", async () => {
    expect(await countDrillQueue(db, userId)).toEqual({
      due: 0,
      fresh: 0,
      byOrigin: { "repertoire-deviation": 0, "engine-blunder": 0, "repertoire-line": 0 },
    });
  });

  it("counts a seeded but never scheduled drill as fresh, not due", async () => {
    // "Never asked" and "asked and come round again" are different
    // invitations, and a screen that merges them cannot word either.
    await engineDrill(EPD);

    const queue = await countDrillQueue(db, userId);
    expect(queue).toMatchObject({ due: 0, fresh: 1 });
    expect(queue.byOrigin["engine-blunder"]).toBe(1);
  });

  it("counts a card whose due date has passed", async () => {
    const exercise = await engineDrill(EPD);
    await saveCard(db, exercise.id, cardDue(new Date(Date.now() - DAY_MS)));

    expect(await countDrillQueue(db, userId)).toMatchObject({ due: 1, fresh: 0 });
  });

  it("leaves a card scheduled for the future out of every count", async () => {
    // Offering it today would inflate the number beside the button and
    // then serve something else, which is the one way this screen can be
    // caught lying.
    const exercise = await engineDrill(EPD);
    await saveCard(db, exercise.id, cardDue(new Date(Date.now() + 7 * DAY_MS)));

    const queue = await countDrillQueue(db, userId);
    expect(queue).toMatchObject({ due: 0, fresh: 0 });
    expect(queue.byOrigin["engine-blunder"]).toBe(0);
  });

  it("counts an exercise with both origins in both piles", async () => {
    // Deliberately not slices of one bar: the drill really is waiting for
    // both reasons, and a user filtering by either should find it.
    const exercise = await engineDrill(EPD);
    const [deviation] = await db
      .insert(deviations)
      .values({
        gameId: await aGame(),
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
      origin: { kind: "repertoire-deviation", deviationId: deviation!.id },
    });

    const queue = await countDrillQueue(db, userId);
    expect(queue.fresh).toBe(1); // still one exercise
    expect(queue.byOrigin).toEqual({
      "repertoire-deviation": 1,
      "engine-blunder": 1,
      "repertoire-line": 0,
    });
    expect(exercise.positionKey).toBe(EPD);
  });

  it("keeps two positions apart", async () => {
    await engineDrill(EPD);
    await repertoireDrill(OTHER_EPD);

    const queue = await countDrillQueue(db, userId);
    expect(queue.fresh).toBe(2);
    expect(queue.byOrigin).toEqual({
      "repertoire-deviation": 1,
      "engine-blunder": 1,
      "repertoire-line": 0,
    });
  });

  it("does not count another user's drills", async () => {
    const stranger = await createUser(db);
    await upsertExercise(db, stranger.id, {
      positionKey: EPD,
      expectedSans: ["d4"],
      origin: { kind: "engine-blunder", gameId: await aGame(), ply: 1 },
    });

    // byOrigin is a separate query, so it needs its own assertion: the
    // totals were scoped to the user while the split silently was not.
    expect(await countDrillQueue(db, userId)).toEqual({
      due: 0,
      fresh: 0,
      byOrigin: { "repertoire-deviation": 0, "engine-blunder": 0, "repertoire-line": 0 },
    });
  });
});
