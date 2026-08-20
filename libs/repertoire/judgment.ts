import type { DeviationResult } from "./deviation.ts";

/**
 * The four named outcomes of judging a game against a repertoire.
 * "completed" is DeviationResult.event === null — the whole game stayed
 * inside the prepared tree.
 */
export type JudgmentType = "completed" | "deviation" | "gap" | "book-ended";

export function judgmentType(result: DeviationResult): JudgmentType {
  return result.event?.type ?? "completed";
}
