/**
 * GetAnalysis — one shape for "show me this game's analysis".
 * `completed` bundles the report with the drill CTA's count to avoid a second round trip that could disagree with it.
 * Progress fields stay absent (not zero) until a run exists — "not started" and "started, graded none" differ.
 */
import type { Database } from "@velachess/db";
import { countProgress } from "@velachess/db";
import type { AnalysisQueue } from "@velachess/queue/ports";

import type { GameAnalysisRecord } from "../request-analysis/request-analysis.ts";
import { requestAnalysis } from "../request-analysis/request-analysis.ts";
import type { DrillSummary } from "./drill-summary.ts";
import { drillSummaryFor } from "./drill-summary.ts";

export type AnalysisReport =
  | { status: "not-found" }
  | { status: "completed"; analysis: GameAnalysisRecord; drills: DrillSummary }
  | {
      status: "created" | "queued" | "running" | "failed";
      graded?: number;
      total?: number;
    };

export async function getAnalysisReport(
  db: Database,
  queue: AnalysisQueue,
  gameId: string,
): Promise<AnalysisReport> {
  const request = await requestAnalysis(db, queue, gameId);
  if (request.status === "not-found") return { status: "not-found" };

  if (request.status === "completed") {
    const drills = await drillSummaryFor(db, gameId);
    return { status: "completed", analysis: request.analysis, drills };
  }

  const progress = await countProgress(db, gameId);
  return { status: request.status, ...progress };
}
