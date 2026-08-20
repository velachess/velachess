/**
 * The persisted shape of a scheduled card — plain data, no library types,
 * no domain knowledge. Every field the underlying algorithm needs to
 * resume scheduling after a reload is here; dropping any of them would
 * silently corrupt future intervals.
 */

export type Grade = "again" | "hard" | "good" | "easy";
export type CardPhase = "new" | "learning" | "review" | "relearning";

export interface CardState {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  phase: CardPhase;
  lastReview: Date | null;
}

/** A card whose due date has passed reports "due"; otherwise its phase. */
export function effectiveStatus(
  card: CardState,
  now: Date = new Date(),
): CardPhase | "due" {
  if (card.phase !== "new" && card.due.getTime() <= now.getTime()) return "due";
  return card.phase;
}
