/**
 * Asking for one position's evaluation — the contract both callers share:
 * a whole-game pass delegating to it with `yield*`, and the review
 * exploring a line by hand.
 */
import type { PositionEvaluation } from "@velachess/analysis";
import type { EngineUpdate } from "@velachess/infra-engine";

/**
 * One search: every `info` line as it arrives, returning what the search
 * settled on.
 *
 * `cancel()` is the stop that works. A generator's `return()` is queued
 * behind whatever `next()` is already pending, so an engine that says
 * nothing more would never run the cleanup — cancelling reaches the
 * search itself rather than waiting for the stream to come back.
 */
export type PositionSearch = AsyncGenerator<EngineUpdate, PositionEvaluation> & {
  cancel(): void;
};

export interface PositionEvaluator {
  evaluate(fen: string): PositionSearch;
  /** Final: the evaluator never searches again, and its Worker is gone. */
  dispose(): Promise<void>;
}
