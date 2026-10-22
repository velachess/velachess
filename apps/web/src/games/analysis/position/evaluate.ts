/**
 * Asking for one position's evaluation — the contract a whole-game pass
 * and the review's own exploring both reach the engine through.
 */
import type { PositionEvaluation } from "@velachess/analysis";
import type { EngineUpdate } from "@velachess/infra-engine";

/**
 * One search: every `info` line as it arrives, returning what the search
 * settled on.
 *
 * `cancel()` is the stop that works. A generator's `return()` queues
 * behind whatever `next()` is already pending, so an engine that says
 * nothing more would never run the cleanup.
 */
export type PositionSearch = AsyncGenerator<EngineUpdate, PositionEvaluation> & {
  cancel(): void;
};

export interface PositionEvaluator {
  evaluate(fen: string): PositionSearch;
  /** Final: the evaluator never searches again, and its Worker is gone. */
  dispose(): Promise<void>;
}
