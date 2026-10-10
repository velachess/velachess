/**
 * Composition root for the analysis module's worker-side consumer: adapts
 * the DB client `main.ts` already builds, plus the engine/lock bits
 * `WorkerDeps.analyze` carries, into the full narrow `AnalyzeDeps`
 * `completeAnalysis` declared. A duplicate of `apps/server/tests/
 * harness.ts`'s equivalent construction in shape only — apps never share
 * a composition helper (`no-cross-app-runtime-imports`), so each builds
 * its own.
 */
import type { AnalyzeDeps } from "@velachess/analysis";
import {
  appendProgress,
  clearProgress,
  getAnalysis,
  getGame,
  saveAnalysis,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";

/** The engine/lock bits `main.ts` and this app's own tests provide —
 * everything `AnalyzeDeps` needs that isn't derivable from `db`. */
export type EngineDeps = Pick<
  AnalyzeDeps,
  "makeSession" | "tryAcquireLock" | "depth" | "engineVersion"
>;

export function buildAnalyzeDeps(db: Database, engine: EngineDeps): AnalyzeDeps {
  return {
    ...engine,
    getGame: (gameId) => getGame(db, gameId),
    getAnalysis: (gameId) => getAnalysis(db, gameId),
    withTransaction: (fn) => db.transaction(fn),
    saveAnalysis: (tx, gameId, data) => saveAnalysis(tx, gameId, data),
    appendProgress: (entry) => appendProgress(db, entry),
    clearProgress: (gameId) => clearProgress(db, gameId),
  };
}
