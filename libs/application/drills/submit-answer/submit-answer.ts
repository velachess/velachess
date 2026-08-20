/**
 * SubmitAnswer — grade one attempt and move the FSRS card.
 */
import type { Database } from "@velachess/db";
import {
  getExerciseForUser,
  getOrCreateCard,
  recordResponse,
  saveCard,
} from "@velachess/db";
import type { CardState, Scheduler } from "@velachess/scheduler";

import type { DrillGrade } from "./answer.ts";
import { checkAnswer, gradeResponse } from "./answer.ts";

export interface AnswerOutcome {
  correct: boolean;
  grade: DrillGrade;
  expectedSans: string[];
  nextDue: Date;
}

export async function submitAnswer(
  db: Database,
  scheduler: Scheduler,
  userId: string,
  input: { exerciseId: string; san: string; responseTimeMs?: number; now?: Date },
): Promise<AnswerOutcome | null> {
  // Scoped: the exercise id arrives in a request body, which makes it a
  // claim. Answering writes a response row and moves an FSRS card, and
  // only the session's user gets to move their own.
  const exercise = await getExerciseForUser(db, userId, input.exerciseId);
  if (!exercise) return null;
  const now = input.now ?? new Date();

  const correct = checkAnswer(exercise, input.san);
  const grade = gradeResponse({
    correct,
    ...(input.responseTimeMs !== undefined
      ? { responseTimeMs: input.responseTimeMs }
      : {}),
  });
  await recordResponse(db, exercise.id, {
    correct,
    grade,
    ...(input.responseTimeMs !== undefined
      ? { responseTimeMs: input.responseTimeMs }
      : {}),
  });

  const card: CardState = await getOrCreateCard(db, exercise.id, scheduler.newCard(now));
  const reviewed = scheduler.review(card, grade, now);
  await saveCard(db, exercise.id, reviewed);

  return { correct, grade, expectedSans: exercise.expectedSans, nextDue: reviewed.due };
}
