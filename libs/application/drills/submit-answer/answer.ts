/**
 * Answer checking and grade mapping. SAN comparison is strict — the
 * caller converts UI input to SAN with the chess package's makeSan; this
 * module never parses moves.
 */

export type DrillGrade = "again" | "hard" | "good" | "easy";

export interface ExerciseResponse {
  correct: boolean;
  /** Captured when available; not yet part of the grade mapping. */
  responseTimeMs?: number;
}

export function checkAnswer(exercise: { expectedSans: string[] }, san: string): boolean {
  return exercise.expectedSans.includes(san);
}

/**
 * Binary correctness → FSRS grade. "hard"/"easy" are reserved for signals
 * not collected yet (response time, repeated lapses); extending this
 * mapping must not change the meaning of "good" and "again".
 */
export function gradeResponse(response: ExerciseResponse): DrillGrade {
  return response.correct ? "good" : "again";
}
