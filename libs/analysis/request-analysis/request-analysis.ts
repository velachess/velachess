/**
 * RequestAnalysis — what pressing "analyze" means: report the terminal
 * state if one exists, otherwise queue the work.
 */
import type { Game, GameAnalysisRow } from "@velachess/infra-db";

export type GameAnalysisRecord = GameAnalysisRow;

export type AnalysisRequest =
  | { status: "created" | "queued" | "running" | "failed" }
  | { status: "completed"; analysis: GameAnalysisRecord }
  | { status: "not-found" };

type GetGame = (gameId: string) => Promise<Game | null>;
type GetGameForUser = (userId: string, gameId: string) => Promise<Game | null>;
type GetAnalysis = (gameId: string) => Promise<GameAnalysisRecord | null>;
/** The same vocabulary `AnalysisQueue.getState` answers, declared locally
 * so this slice never imports the queue port itself. */
type QueueState = "queued" | "active" | "failed" | "none";
type GetQueueState = (gameId: string) => Promise<QueueState>;
type EnqueueAnalysis = (gameId: string) => Promise<void>;

export interface RequestAnalysisDeps {
  getGame: GetGame;
  getGameForUser: GetGameForUser;
  getAnalysis: GetAnalysis;
  getQueueState: GetQueueState;
  enqueueAnalysis: EnqueueAnalysis;
}

/** Read-only state composition — never inspects locks (that would be TOCTOU;
 * ownership is decided only by tryStartAnalysis). */
export async function requestAnalysis(
  deps: RequestAnalysisDeps,
  gameId: string,
): Promise<AnalysisRequest> {
  const game = await deps.getGame(gameId);
  if (!game) return { status: "not-found" };

  const cached = await deps.getAnalysis(gameId);
  if (cached) return { status: "completed", analysis: cached };

  const queueState = await deps.getQueueState(gameId);
  if (queueState === "failed") return { status: "failed" };
  if (queueState === "queued" || queueState === "active") return { status: "queued" };

  return { status: "created" };
}

/** Same state, scoped to its owner: someone else's game id and a missing
 * one are the same "not-found", so a caller never confirms which uuids
 * exist. */
export async function requestAnalysisForUser(
  deps: RequestAnalysisDeps,
  userId: string,
  gameId: string,
): Promise<AnalysisRequest> {
  const owned = await deps.getGameForUser(userId, gameId);
  if (!owned) return { status: "not-found" };
  return requestAnalysis(deps, gameId);
}

/** What pressing "analyze" does: report a terminal or in-flight state as
 * it is, otherwise start the one engine trigger in the system. */
export async function startAnalysisForUser(
  deps: RequestAnalysisDeps,
  userId: string,
  gameId: string,
): Promise<AnalysisRequest> {
  const request = await requestAnalysisForUser(deps, userId, gameId);
  if (request.status !== "created") return request;
  await deps.enqueueAnalysis(gameId);
  return { status: "queued" };
}
