/**
 * The triage rule: which judged deviation deserves to become an exercise.
 *
 * A deviation drills when it was the owner's own move and there is a
 * prepared answer to recall. That is the whole rule, and it deliberately
 * does not ask the engine.
 *
 * It used to. Requiring the engine to confirm the move hurt made this
 * origin a near-subset of the engine origin: the engine grades every ply
 * of the game, opening included, so a deviation bad enough to pass the
 * severity floor was already being drilled as a blunder. Two origins that
 * fire on the same moves are one origin with extra bookkeeping.
 *
 * The two are asking different questions. The engine asks whether you
 * played *well*; the repertoire asks whether you played what you
 * *decided*. Forgetting your line and playing a perfectly sound
 * alternative costs zero evaluation, so the engine will never mention it
 * — and that is exactly the failure repertoire drilling exists to catch.
 *
 * Volume is bounded by `deviations_game_repertoire`: one deviation per
 * game per repertoire, so this needs no budget the way the engine path
 * does.
 */

type JudgmentKind =
  | "completed"
  | "deviation"
  | "gap"
  | "book-ended"
  /** Persisted judgments include games no chapter could judge; they
   * carry nothing to recall and are never eligible. */
  | "unmatched";
export type Severity = "ok" | "inaccuracy" | "mistake" | "blunder";

export interface EligibilityInput {
  type: JudgmentKind;
  /** What your preparation said to play. Without it there is nothing to
   * recall, so there is no exercise to build. */
  expectedSans: string[] | null;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  ok: 0,
  inaccuracy: 1,
  mistake: 2,
  blunder: 3,
};

const DEFAULT_MIN_SEVERITY: Exclude<Severity, "ok"> = "inaccuracy";

/**
 * The severity half of the rule, shared by both drill origins.
 *
 * It was buried inside `eligibleForDrill`, which answers two questions at
 * once — *is this the right kind of thing* and *did it hurt enough*. Only
 * the first is about repertoires; the second is the same ruler whether
 * the move broke your preparation or just lost material.
 *
 * An unanalyzed row is not eligible: analysis is a prerequisite, and a
 * null category means the engine has not spoken rather than that it said
 * the move was fine.
 */
export function severeEnough(
  category: Severity | null,
  minSeverity: Exclude<Severity, "ok"> = DEFAULT_MIN_SEVERITY,
): boolean {
  if (category === null) return false;
  return SEVERITY_ORDER[category] >= SEVERITY_ORDER[minSeverity];
}

export function eligibleForDrill(row: EligibilityInput): boolean {
  if (row.type !== "deviation") return false;
  return (row.expectedSans?.length ?? 0) > 0;
}
