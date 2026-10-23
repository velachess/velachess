/** The contract a whole-game pass and the review's exploring both reach
 * the engine through. */
import type { PositionEvaluation } from "@velachess/analysis";
import type { EngineUpdate } from "@velachess/infra-engine";

/**
 * One search: every `info` line as it arrives, returning what it settled
 * on. `cancel()` is the stop that works — a generator's `return()` queues
 * behind whatever `next()` is already pending.
 */
export type PositionSearch = AsyncGenerator<EngineUpdate, PositionEvaluation> & {
  cancel(): void;
};

export interface PositionEvaluator {
  evaluate(fen: string): PositionSearch;
  /** Final: the evaluator never searches again. */
  dispose(): Promise<void>;
}
