/**
 * SubmitAnswer — grade one attempt and move the FSRS card.
 */
import type { CardState, Grade } from "@velachess/scheduler";

import type { DrillGrade } from "./answer.ts";
import { checkAnswer, gradeResponse } from "./answer.ts";

interface AnswerExercise {
  id: string;
  expectedSans: string[];
}

type GetExerciseForUser = (
  userId: string,
  exerciseId: string,
) => Promise<AnswerExercise | null>;
type GetOrCreateCard = (exerciseId: string, fresh: CardState) => Promise<CardState>;
type RecordResponse = (
  exerciseId: string,
  response: { correct: boolean; grade: DrillGrade; responseTimeMs?: number },
) => Promise<unknown>;
type SaveCard = (exerciseId: string, state: CardState) => Promise<CardState>;
type NewCard = (now: Date) => CardState;
type ReviewCard = (card: CardState, grade: Grade, now: Date) => CardState;

export interface SubmitAnswerDeps {
  getExerciseForUser: GetExerciseForUser;
  getOrCreateCard: GetOrCreateCard;
  recordResponse: RecordResponse;
  saveCard: SaveCard;
  newCard: NewCard;
  reviewCard: ReviewCard;
}

export interface AnswerOutcome {
  correct: boolean;
  grade: DrillGrade;
  expectedSans: string[];
  nextDue: Date;
}

export async function submitAnswer(
  deps: SubmitAnswerDeps,
  userId: string,
  input: { exerciseId: string; san: string; responseTimeMs?: number; now?: Date },
): Promise<AnswerOutcome | null> {
  // Scoped: the exercise id arrives in a request body, which makes it a
  // claim. Answering writes a response row and moves an FSRS card, and
  // only the session's user gets to move their own.
  const exercise = await deps.getExerciseForUser(userId, input.exerciseId);
  if (!exercise) return null;
  const now = input.now ?? new Date();

  const correct = checkAnswer(exercise, input.san);
  const grade = gradeResponse({
    correct,
    ...(input.responseTimeMs !== undefined
      ? { responseTimeMs: input.responseTimeMs }
      : {}),
  });
  await deps.recordResponse(exercise.id, {
    correct,
    grade,
    ...(input.responseTimeMs !== undefined
      ? { responseTimeMs: input.responseTimeMs }
      : {}),
  });

  const card = await deps.getOrCreateCard(exercise.id, deps.newCard(now));
  const reviewed = deps.reviewCard(card, grade, now);
  await deps.saveCard(exercise.id, reviewed);

  return { correct, grade, expectedSans: exercise.expectedSans, nextDue: reviewed.due };
}
