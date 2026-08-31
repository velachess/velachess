/**
 * GetAnalysis — one shape for "show me this game's analysis".
 * `completed` bundles the report with the drill CTA's count to avoid a second round trip that could disagree with it.
 * Progress fields stay absent (not zero) until a run exists — "not started" and "started, graded none" differ.
 */
import type {
  AnalysisRequest,
  GameAnalysisRecord,
} from "../request-analysis/request-analysis.ts";
import {
  drillSummaryFor,
  type DrillSummary,
  type DrillSummaryDeps,
} from "./drill-summary.ts";

export type AnalysisReport =
  | { status: "not-found" }
  | { status: "completed"; analysis: GameAnalysisRecord; drills: DrillSummary }
  | {
      status: "created" | "queued" | "running" | "failed";
      graded?: number;
      total?: number;
    };

/** request-analysis is this module's own sibling slice — still external per
 * the model, wired through composition like any cross-module dependency. */
type RequestAnalysisForUser = (
  userId: string,
  gameId: string,
) => Promise<AnalysisRequest>;
type CountProgress = (
  gameId: string,
) => Promise<{ graded: number; total: number } | null>;

export interface GetAnalysisDeps extends DrillSummaryDeps {
  requestAnalysisForUser: RequestAnalysisForUser;
  countProgress: CountProgress;
}

export async function getAnalysisReport(
  deps: GetAnalysisDeps,
  userId: string,
  gameId: string,
): Promise<AnalysisReport> {
  const request = await deps.requestAnalysisForUser(userId, gameId);
  if (request.status === "not-found") return { status: "not-found" };

  if (request.status === "completed") {
    const drills = await drillSummaryFor(deps, gameId);
    return { status: "completed", analysis: request.analysis, drills };
  }

  const progress = await deps.countProgress(gameId);
  return { status: request.status, ...progress };
}
