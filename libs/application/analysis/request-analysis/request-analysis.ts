/**
 * RequestAnalysis — what pressing "analyze" means: report the terminal
 * state if one exists, otherwise queue the work.
 */
import type { Database, GameAnalysisRow } from "@velachess/db";
import { getAnalysis, getGame } from "@velachess/db";
import type { AnalysisQueue } from "@velachess/queue/ports";

export type GameAnalysisRecord = GameAnalysisRow;

export type AnalysisRequest =
  | { status: "created" | "queued" | "running" | "failed" }
  | { status: "completed"; analysis: GameAnalysisRecord }
  | { status: "not-found" };

/** Read-only state composition — never inspects locks (that would be TOCTOU;
 * ownership is decided only by tryStartAnalysis). */
export async function requestAnalysis(
  db: Database,
  queue: AnalysisQueue,
  gameId: string,
): Promise<AnalysisRequest> {
  const game = await getGame(db, gameId);
  if (!game) return { status: "not-found" };

  const cached = await getAnalysis(db, gameId);
  if (cached) return { status: "completed", analysis: cached };

  const queueState = await queue.getState(gameId);
  if (queueState === "failed") return { status: "failed" };
  if (queueState === "queued" || queueState === "active") return { status: "queued" };

  return { status: "created" };
}
