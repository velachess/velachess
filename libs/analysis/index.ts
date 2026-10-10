/**
 * [ANALYSIS] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel. See AGENTS.md "Modules and slices" for
 * what belongs here versus what stays a private slice file.
 *
 * Owns the Stockfish job lifecycle end to end: request (queue or report),
 * process (execute under the advisory lock, persist), watch (poll progress
 * for a live stream), and get (the composed read a game page renders).
 *
 * `score.ts`/`winchance.ts` are module-level pure policies (no DB/queue
 * dependency of their own). `classifyMove`'s machinery
 * (`process-analysis/classify-move.ts`) stays private there: only
 * `process-analysis` uses it.
 *
 * `requestAnalysis` (unscoped) is exported alongside `requestAnalysisForUser`
 * so `apps/server/src/composition/analysis.ts` can wire `get-analysis` and
 * `watch-analysis`'s own declared dependency on their sibling slice
 * `request-analysis` to the same real handler.
 *
 * `scoreToWinChance` is exported for `apps/web/src/games/analysis-read.ts`,
 * the one consumer outside this whole module's graph. `completeAnalysis`
 * is a lazy wrapper, not a direct re-export: `process-analysis.ts` uses
 * `node:crypto`/`node:events`, and a static re-export here would put both
 * in the static import graph of every consumer of this file, including
 * apps/web's own bundle — a browser can't load either. The dynamic
 * `import()` keeps that subtree out of anything that only touches this
 * module's pure exports; nothing about the backend's own call sites
 * changes; `completeAnalysis` is still one `await` away.
 */

export { getAnalysisReport } from "./get-analysis/get-analysis.ts";
export type { AnalysisReport, GetAnalysisDeps } from "./get-analysis/get-analysis.ts";

export {
  requestAnalysis,
  requestAnalysisForUser,
  startAnalysisForUser,
} from "./request-analysis/request-analysis.ts";
export type {
  AnalysisRequest,
  GameAnalysisRecord,
  RequestAnalysisDeps,
} from "./request-analysis/request-analysis.ts";

export { createWatchers } from "./watch-analysis/watchers.ts";
export type {
  WatcherDeps,
  Watchers,
  WatchSnapshot,
  WatchTerminal,
} from "./watch-analysis/watchers.ts";

export type { AnalyzeDeps } from "./process-analysis/process-analysis.ts";
export type { GradedPly } from "./process-analysis/analyze-game.ts";

export async function completeAnalysis(
  deps: import("./process-analysis/process-analysis.ts").AnalyzeDeps,
  gameId: string,
): Promise<void> {
  const { completeAnalysis: run } =
    await import("./process-analysis/process-analysis.ts");
  return run(deps, gameId);
}

export { scoreToWinChance } from "./process-analysis/classify-move.ts";
