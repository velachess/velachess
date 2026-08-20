/**
 * [CONSUMER] analysis — pg-boss delivery → the process-analysis slice.
 * Unpack, invoke, let the throw drive retry → DLQ. Nothing else.
 */
import { completeAnalysis } from "@velachess/application/analysis/process-analysis/process-analysis";
import type { AnalysisJobData } from "@velachess/queue";

import type { WorkerDeps } from "../worker.ts";

/** completeAnalysis returns on terminal truth and throws when a live
 * executor owns the run; pg-boss's retry schedule decides when this
 * delivery is attempted again. */
export async function consumeAnalysisJob(
  deps: WorkerDeps,
  data: AnalysisJobData,
): Promise<void> {
  await completeAnalysis(deps.db, deps.analyze, data.gameId);
}
