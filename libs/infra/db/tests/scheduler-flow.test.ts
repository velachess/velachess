// @vitest-environment node
/**
 * Cycle-4 e2e: exercise → graded response → card reviewed and persisted →
 * due queue and forecast, chaining what cycles 0–3 built.
 */
import { parsePgn, replayMainline, type Game, type PgnNodeData } from "@velachess/chess";
import { buildRepertoire, findDeviation } from "@velachess/repertoire";
import { makeScheduler } from "@velachess/scheduler";
import {
  checkAnswer,
  gradeResponse,
} from "@velachess/application/drills/submit-answer/answer";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@velachess/db";
import {
  addChapter,
  cards,
  createRepertoire,
  createUser,
  deviations,
  exercises,
  games,
  getCard,
  getOrCreateCard,
  listDueExercises,
  recordResponse,
  repertoireChapters,
  repertoires,
  saveCard,
  drillResponses,
  upsertExercise,
  upsertJudgment,
  users,
} from "@velachess/db";

import { createTestDb } from "./test-db.ts";

const { db, close } = await createTestDb();

afterAll(() => close());

beforeEach(async () => {
  await db.delete(cards);
  await db.delete(drillResponses);
  await db.delete(exercises);
  await db.delete(deviations);
  await db.delete(repertoireChapters);
  await db.delete(repertoires);
  await db.delete(games);
  await db.delete(users);
});

const CHAPTER_PGN = "1. e4 e6 2. d4 d5 3. Nc3 *";
const GAME_PGN = "1. e4 e6 2. Nf3 d5 *";
const T0 = new Date("2026-08-14T12:00:00Z");

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

async function setupExercise(database: Database) {
  const user = await createUser(database);
  const rep = await createRepertoire(database, {
    userId: user.id,
    name: "White",
    color: "white",
  });
  const chapter = await addChapter(database, {
    repertoireId: rep.id,
    name: "French",
    sortOrder: 1,
    pgn: CHAPTER_PGN,
    startingFen: null,
  });

  const built = buildRepertoire(firstGame(CHAPTER_PGN)).unwrap();
  const replay = replayMainline(firstGame(GAME_PGN)).unwrap();
  const result = findDeviation(built, replay, "white");

  const [game] = await database
    .insert(games)
    .values({
      source: "pgn",
      whiteName: "w",
      blackName: "b",
      result: "*",
      hasClocks: false,
      rawPgn: GAME_PGN,
      movetextHash: "s1",
    })
    .returning();

  const judgment = await upsertJudgment(
    database,
    {
      gameId: game!.id,
      repertoireId: rep.id,
      chapterId: chapter.id,
      repertoireName: rep.name,
      chapterName: chapter.name,
      gamePlies: replay.moves.length,
    },
    result,
  );

  const exercise = await upsertExercise(database, user.id, {
    positionKey: judgment.positionKey!,
    expectedSans: judgment.expectedSans!,
    origin: { kind: "repertoire-deviation" as const, deviationId: judgment.id },
  });

  return { user, exercise };
}

describe("cards persistence", () => {
  it("getOrCreateCard is idempotent; saveCard round-trips the exact state", async () => {
    const { exercise } = await setupExercise(db);
    const scheduler = makeScheduler();

    const first = await getOrCreateCard(db, exercise.id, scheduler.newCard(T0));
    const second = await getOrCreateCard(db, exercise.id, scheduler.newCard(new Date()));
    expect(second).toEqual(first);

    const reviewed = scheduler.review(first, "good", T0);
    await saveCard(db, exercise.id, reviewed);
    const read = await getCard(db, exercise.id);
    expect(read).toEqual(reviewed);
  });

  it("deleting the exercise cascades its card", async () => {
    const { exercise } = await setupExercise(db);
    const scheduler = makeScheduler();
    await getOrCreateCard(db, exercise.id, scheduler.newCard(T0));

    await db.delete(exercises);
    expect(await db.select().from(cards)).toHaveLength(0);
  });
});

describe("cycle-4 acceptance: response → review → due queue → forecast", () => {
  it("chains the full loop", async () => {
    const { user, exercise } = await setupExercise(db);
    const scheduler = makeScheduler();

    // Right answer → good → card scheduled into the future.
    const rightSan = exercise.expectedSans[0]!;
    const correct = checkAnswer(exercise, rightSan);
    expect(correct).toBe(true);
    const grade = gradeResponse({ correct });
    await recordResponse(db, exercise.id, { correct, grade });

    let card = await getOrCreateCard(db, exercise.id, scheduler.newCard(T0));
    card = scheduler.review(card, grade, T0);
    await saveCard(db, exercise.id, card);

    expect(card.phase).toBe("learning");
    expect(card.due.getTime()).toBeGreaterThan(T0.getTime());

    // Not due yet → empty queue at T0; due once the clock passes it.
    expect(await listDueExercises(db, user.id, T0)).toHaveLength(0);
    const afterDue = new Date(card.due.getTime() + 1);
    const queue = await listDueExercises(db, user.id, afterDue);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.exerciseId).toBe(exercise.id);
    expect(queue[0]!.expectedSans).toEqual(exercise.expectedSans);

    // Wrong answer at the due moment → again → lapse tracked by the algorithm.
    // (graduate to review first so the lapse is a real forgetting event)
    card = scheduler.review(card, "good", afterDue);
    await saveCard(db, exercise.id, card);
    expect(card.phase).toBe("review");

    const wrong = checkAnswer(exercise, "Qh5");
    expect(wrong).toBe(false);
    const againGrade = gradeResponse({ correct: wrong });
    await recordResponse(db, exercise.id, { correct: wrong, grade: againGrade });

    const lapsesBefore = card.lapses;
    card = scheduler.review(card, againGrade, new Date(card.due.getTime() + 1));
    await saveCard(db, exercise.id, card);
    expect(card.phase).toBe("relearning");
    expect(card.lapses).toBe(lapsesBefore + 1);
  });
});
