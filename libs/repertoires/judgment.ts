/**
 * The four named outcomes of judging a game against a repertoire.
 * "completed" is DeviationResult.event === null — the whole game stayed
 * inside the prepared tree.
 *
 * Module-level pure policy — every other module (games, accounts) reaches
 * it through this module's `index.ts`.
 */
export type JudgmentType = "completed" | "deviation" | "gap" | "book-ended";

/**
 * Structurally compatible with games/judge-games's own DeviationResult
 * (see its deviation.ts) — this function only ever reads `event?.type`,
 * so that's the whole shape it needs. Duplicate the type, never the
 * implementation.
 */
interface JudgmentSource {
  event: { type: "deviation" | "gap" | "book-ended" } | null;
}

export function judgmentType(result: JudgmentSource): JudgmentType {
  return result.event?.type ?? "completed";
}
