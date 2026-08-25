// @vitest-environment node
/**
 * Cycle-3 e2e: judgment → engine signal → triage → exercise (deduped,
 * with provenance) → answer → graded response, all read back. Plus the
 * counter-case: a harmless deviation creates nothing.
 */
import { parsePgn, replayMainline, type Game, type PgnNodeData } from "@velachess/chess";
import { buildRepertoire, findDeviation } from "@velachess/repertoire";
import {
  checkAnswer,
  gradeResponse,
} from "@velachess/application/drills/submit-answer/answer";
import { eligibleForDrill } from "@velachess/application/drills/seed-exercises/eligibility";
import { seedFromDeviation } from "@velachess/application/drills/seed-exercises/exercise";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "@velachess/db";
import {
  addChapter,
  applyEngineSignal,
  createRepertoire,
  createUser,
  deviations,
  exerciseSources,
  exercises,
  listExercisesByUser,
  games,
  recordResponse,
  repertoireChapters,
  repertoires,
  setDrillable,
  drillResponses,
  upsertExercise,
  upsertJudgment,
  users,
} from "@velachess/db";

import { createTestDb } from "./test-db.ts";

const { db, close } = await createTestDb();

afterAll(() => close());

beforeEach(async () => {
  await db.delete(drillResponses);
  await db.delete(exercises);
  await db.delete(deviations);
  await db.delete(repertoireChapters);
  await db.delete(repertoires);
  await db.delete(games);
  await db.delete(users);
});

const CHAPTER_PGN = "1. e4 e6 2. d4 d5 3. Nc3 *";

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

function insertGame(database: Database, movetextHash: string) {
  return database
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
  return { user, rep, chapter };
}

async function judgeGame(
  rep: { id: string; name: string },
  chapter: { id: string; name: string },
  gamePgn: string,
  hash: string,
) {
  const built = buildRepertoire(firstGame(CHAPTER_PGN)).unwrap();
  const replay = replayMainline(firstGame(gamePgn)).unwrap();
  const result = findDeviation(built, replay, "white");
  const game = await insertGame(db, hash);
  return upsertJudgment(
    db,
    {
      gameId: game.id,
      repertoireId: rep.id,
      chapterId: chapter.id,
      repertoireName: rep.name,
      chapterName: chapter.name,
      gamePlies: replay.moves.length,
    },
    result,
  );
}

describe("cycle-3 acceptance: judgment → signal → triage → exercise → response", () => {
  it("runs the whole chain and reads back coherently", async () => {
    const { user, rep, chapter } = await setup();

    // Same deviation position in two different games.
    const first = await judgeGame(rep, chapter, "1. e4 e6 2. Nf3 d5 *", "t1");
    const second = await judgeGame(rep, chapter, "1. e4 e6 2. Nf3 c5 *", "t2");
    expect(first.type).toBe("deviation");
    expect(first.positionKey).toBe(second.positionKey);

    for (const judgment of [first, second]) {
      const signaled = await applyEngineSignal(db, judgment.id, {
        cpLoss: 85,
        engineCategory: "mistake",
      });

      const eligible = eligibleForDrill({
        type: signaled!.type,
        expectedSans: signaled!.expectedSans,
      });
      expect(eligible).toBe(true);

      await setDrillable(db, judgment.id, eligible);
      const seed = seedFromDeviation(signaled!);
      expect(seed).not.toBeNull();
      await upsertExercise(db, user.id, seed!);
    }

    // Dedup: one exercise, two provenances.
    const list = await listExercisesByUser(db, user.id);
    expect(list).toHaveLength(1);
    const exercise = list[0]!;
    const provenances = await db
      .select({ deviationId: exerciseSources.deviationId })
      .from(exerciseSources)
      .where(eq(exerciseSources.exerciseId, exercise.id));
    expect(provenances.map((p) => p.deviationId).toSorted()).toEqual(
      [first.id, second.id].toSorted(),
    );
    expect(exercise.expectedSans).toEqual(["d4"]);

    // Answering.
    const right = checkAnswer(exercise!, "d4");
    const wrong = checkAnswer(exercise!, "Nf3");
    expect(right).toBe(true);
    expect(wrong).toBe(false);

    const good = await recordResponse(db, exercise!.id, {
      correct: right,
      grade: gradeResponse({ correct: right }),
    });
    const again = await recordResponse(db, exercise!.id, {
      correct: wrong,
      grade: gradeResponse({ correct: wrong }),
    });
    expect(good.grade).toBe("good");
    expect(again.grade).toBe("again");
    expect(good.responseTimeMs).toBeNull();

    const drilled = await db.select().from(deviations);
    expect(drilled.every((d) => d.drillable)).toBe(true);
  });

  it("drills a departure the engine called harmless", async () => {
    // This asserted the opposite until the two origins were compared
    // side by side. The engine grades every ply of the game, so a
    // deviation bad enough to clear a severity floor was already being
    // drilled as a blunder — gating on severity made this origin a
    // subset of that one.
    //
    // The point of a repertoire drill is the sound move that is not your
    // move: zero evaluation lost, preparation forgotten, and the engine
    // permanently silent about it.
    const { rep, chapter } = await setup();
    const judgment = await judgeGame(rep, chapter, "1. e4 e6 2. Nf3 d5 *", "t3");
    const signaled = await applyEngineSignal(db, judgment.id, {
      cpLoss: 5,
      engineCategory: "ok",
    });

    expect(
      eligibleForDrill({
        type: signaled!.type,
        expectedSans: signaled!.expectedSans,
      }),
    ).toBe(true);
  });

  it("does not make a deviation wait for analysis", async () => {
    // Judging already knows everything this decision needs. Waiting for
    // the engine left a deviation undrillable until an unrelated job
    // finished — and forever, if the game had been analyzed before the
    // repertoire existed, because nothing re-analyzes it.
    const { rep, chapter } = await setup();
    const judgment = await judgeGame(rep, chapter, "1. e4 e6 2. Nf3 d5 *", "t4");

    expect(judgment.engineCategory).toBeNull();
    expect(
      eligibleForDrill({
        type: judgment.type,
        expectedSans: judgment.expectedSans,
      }),
    ).toBe(true);
  });

  it("the grade enum accepts all four values", async () => {
    const { user, rep, chapter } = await setup();
    const judgment = await judgeGame(rep, chapter, "1. e4 e6 2. Nf3 d5 *", "t5");
    const exercise = await upsertExercise(db, user.id, {
      positionKey: judgment.positionKey!,
      expectedSans: judgment.expectedSans!,
      origin: { kind: "repertoire-deviation" as const, deviationId: judgment.id },
    });

    for (const grade of ["again", "hard", "good", "easy"] as const) {
      const saved = await recordResponse(db, exercise.id, {
        correct: grade !== "again",
        grade,
        responseTimeMs: 1200,
      });
      expect(saved.grade).toBe(grade);
      expect(saved.responseTimeMs).toBe(1200);
    }
  });

  it("re-upserting refreshes expectedSans without duplicating the exercise", async () => {
    const { user, rep, chapter } = await setup();
    const judgment = await judgeGame(rep, chapter, "1. e4 e6 2. Nf3 d5 *", "t6");

    await upsertExercise(db, user.id, {
      positionKey: judgment.positionKey!,
      expectedSans: ["d4"],
      origin: { kind: "repertoire-deviation" as const, deviationId: judgment.id },
    });
    await upsertExercise(db, user.id, {
      positionKey: judgment.positionKey!,
      expectedSans: ["d4", "Nc3"],
      origin: { kind: "repertoire-deviation" as const, deviationId: judgment.id },
    });

    const list = await listExercisesByUser(db, user.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.expectedSans).toEqual(["d4", "Nc3"]);
  });
});
