import type { GradedPly } from "@velachess/analysis";
import { and, desc, eq, sql } from "drizzle-orm";

import type { StoredGradedPly } from "../schema.ts";

// Drift guard: the schema's structural mirror must stay assignable from the
// real GradedPly — both directions, checked at typecheck time.
const toStoredDriftCheck: StoredGradedPly = {} as GradedPly;
const fromStoredDriftCheck: GradedPly = {} as StoredGradedPly;
void toStoredDriftCheck;
void fromStoredDriftCheck;

import type { Database } from "../client.ts";
import { analysisProgress, deviations, gameAnalyses } from "../schema.ts";

export async function saveAnalysis(
  db: Database,
  gameId: string,
  data: { engineVersion: string; depth: number; positions: GradedPly[] },
) {
  const row = { gameId, ...data };
  const [analysis] = await db
    .insert(gameAnalyses)
    .values(row)
    .onConflictDoUpdate({ target: [gameAnalyses.gameId], set: row })
    .returning();
  return analysis!;
}

/** Null = never analyzed. A row is the cached full report — and "completed". */
export async function getAnalysis(db: Database, gameId: string) {
  const [analysis] = await db
    .select()
    .from(gameAnalyses)
    .where(eq(gameAnalyses.gameId, gameId));
  return analysis ?? null;
}

/**
 * One graded position, committed on its own — never inside the report's
 * transaction, since an uncommitted row can't be read by the connection
 * streaming it. Replaying an already-written index is a no-op.
 */
export async function appendProgress(
  db: Database,
  entry: {
    runId: string;
    gameId: string;
    index: number;
    total: number;
    position: GradedPly;
  },
) {
  await db
    .insert(analysisProgress)
    .values(entry)
    .onConflictDoNothing({
      target: [analysisProgress.runId, analysisProgress.index],
    });
}

/**
 * The newest run's id for a game, or null when none has written yet.
 *
 * By `seq`, not by `created_at`: rows written inside one clock tick tie on
 * a timestamp, and losing that tie means reporting a dead run's progress.
 */
async function newestRunId(db: Database, gameId: string) {
  const [newest] = await db
    .select({ runId: analysisProgress.runId })
    .from(analysisProgress)
    .where(eq(analysisProgress.gameId, gameId))
    .orderBy(desc(analysisProgress.seq))
    .limit(1);
  return newest?.runId ?? null;
}

/**
 * What a run in flight has graded so far, in order.
 *
 * Scoped to the newest run, so a crashed attempt's leftovers never
 * interleave with the one that replaced it.
 */
export async function listProgress(db: Database, gameId: string) {
  const runId = await newestRunId(db, gameId);
  if (!runId) return [];

  return db
    .select({
      runId: analysisProgress.runId,
      index: analysisProgress.index,
      total: analysisProgress.total,
      position: analysisProgress.position,
    })
    .from(analysisProgress)
    .where(and(eq(analysisProgress.gameId, gameId), eq(analysisProgress.runId, runId)))
    .orderBy(analysisProgress.index);
}

/** `graded` out of `total`, or null when no run has reported anything. */
export async function countProgress(db: Database, gameId: string) {
  const runId = await newestRunId(db, gameId);
  if (!runId) return null;

  const [counted] = await db
    .select({
      graded: sql<number>`count(*)::int`,
      total: sql<number>`max(${analysisProgress.total})::int`,
    })
    .from(analysisProgress)
    .where(and(eq(analysisProgress.gameId, gameId), eq(analysisProgress.runId, runId)));

  return counted && counted.graded > 0 ? counted : null;
}

/** Called once the report has landed — the durable record supersedes these. */
export async function clearProgress(db: Database, gameId: string) {
  await db.delete(analysisProgress).where(eq(analysisProgress.gameId, gameId));
}

/** Fills the severity columns cycle 0 left nullable. */
export async function applyEngineSignal(
  db: Database,
  deviationId: string,
  signal: {
    cpLoss: number | null;
    engineCategory: "ok" | "inaccuracy" | "mistake" | "blunder";
  },
) {
  const [updated] = await db
    .update(deviations)
    .set({ cpLoss: signal.cpLoss, engineCategory: signal.engineCategory })
    .where(eq(deviations.id, deviationId))
    .returning();
  return updated ?? null;
}
