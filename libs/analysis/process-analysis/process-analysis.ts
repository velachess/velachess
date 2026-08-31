/**
 * Analysis orchestration: one primitive, two callers (interactive route,
 * background consumer). Execution ownership is decided atomically by the
 * advisory lock; the execution loop is owned here — subscribers observe,
 * they never drive.
 */

import { randomUUID } from "node:crypto";
import { EventEmitter, on } from "node:events";

import { parsePgn } from "@velachess/chess";
import type { Database, Game, GameAnalysisRow } from "@velachess/infra-db";
import type { EngineSession } from "@velachess/infra-engine";

import { analyzeGame, type AnalysisEvent, type GradedPly } from "./analyze-game.ts";
import { engineSignalForDeviation } from "../deviation-signal.ts";

/** Database and a Drizzle transaction share this type in this codebase
 * (see libs/infra/db/client.ts) — named locally so this slice's own
 * transactional dependencies read in its vocabulary instead of taking
 * `Database` itself. */
type Tx = Database;

type TryAcquireLock = (key: string) => Promise<(() => Promise<void>) | null>;
type GetGame = (gameId: string) => Promise<Game | null>;
type GetAnalysis = (gameId: string) => Promise<GameAnalysisRow | null>;
type WithTransaction = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
type SaveAnalysis = (
  tx: Tx,
  gameId: string,
  data: { engineVersion: string; depth: number; positions: GradedPly[] },
) => Promise<GameAnalysisRow>;
type ListJudgmentsByGame = (
  tx: Tx,
  gameId: string,
) => Promise<{ id: string; ply: number | null }[]>;
type ApplyEngineSignal = (
  tx: Tx,
  deviationId: string,
  signal: {
    cpLoss: number | null;
    engineCategory: "ok" | "inaccuracy" | "mistake" | "blunder";
  },
) => Promise<void>;
/** Committed outside any transaction on purpose — see `appendProgress`'s
 * own doc comment at the query site. */
type AppendProgress = (entry: {
  runId: string;
  gameId: string;
  index: number;
  total: number;
  position: GradedPly;
}) => Promise<void>;
type ClearProgress = (gameId: string) => Promise<void>;
type UserIdForGame = (gameId: string) => Promise<string | null>;
/** Cross-module (drills), same shape whether same module or not. */
type SeedDrillsForGame = (userId: string, gameId: string) => Promise<void>;

export interface AnalyzeDeps {
  makeSession: () => Promise<EngineSession>;
  tryAcquireLock: TryAcquireLock;
  getGame: GetGame;
  getAnalysis: GetAnalysis;
  withTransaction: WithTransaction;
  saveAnalysis: SaveAnalysis;
  listJudgmentsByGame: ListJudgmentsByGame;
  applyEngineSignal: ApplyEngineSignal;
  appendProgress: AppendProgress;
  clearProgress: ClearProgress;
  userIdForGame: UserIdForGame;
  seedDrillsForGame: SeedDrillsForGame;
  depth?: number;
  engineVersion?: string;
}

/** The drizzle-inferred row — the library's own type, no parallel shape.
 * Private to this file: request-analysis.ts declares its own identical
 * export for `@velachess/analysis`'s public `GameAnalysisRecord`. */
type GameAnalysisRecord = GameAnalysisRow;

interface AnalysisExecution {
  gameId: string;
  /** Broadcast — subscribe BEFORE start(); stopping reading never stops execution. */
  events: AsyncIterable<AnalysisEvent>;
  /** Resolves once the analysis is persisted; rejects on terminal error. */
  result: Promise<GameAnalysisRecord>;
  /** Execution begins here — subscribers registered first never miss events. */
  start(): void;
}

export type StartAnalysisResult =
  | { status: "started"; execution: AnalysisExecution }
  | { status: "running" }
  | { status: "completed"; analysis: GameAnalysisRecord }
  | { status: "not-found" };

/**
 * The background use case in one call: returns only when the analysis is
 * terminally settled — run by us, already cached, or the game is gone.
 * Throws when a live executor owns the run: the operation cannot complete
 * NOW, and whichever delivery mechanism invoked it decides when to try
 * again. Callers never interpret analysis state to implement retry.
 */
export async function completeAnalysis(deps: AnalyzeDeps, gameId: string): Promise<void> {
  const result = await tryStartAnalysis(deps, gameId);
  if (result.status === "started") {
    result.execution.start();
    await result.execution.result;
    await seedDrillsFor(deps, gameId);
    return;
  }
  if (result.status !== "running") {
    // Completed (cached) or not found. A cached report may predate the
    // engine drill origin, so triage runs anyway — it is idempotent, and
    // this is what backfills games analysed before drills existed.
    if (result.status === "completed") await seedDrillsFor(deps, gameId);
    return;
  }

  // Someone alive holds the lock. If their report already landed, the
  // operation is satisfied; otherwise it cannot complete on this attempt.
  if (await deps.getAnalysis(gameId)) return;
  throw new Error(`analysis of ${gameId} running elsewhere — cannot complete now`);
}

/**
 * Drills follow analysis as one use case, so the worker never learns the ordering.
 * Failures aren't swallowed: a persistently broken triage should be visible, not silently emptying the drill queue.
 */
async function seedDrillsFor(deps: AnalyzeDeps, gameId: string): Promise<void> {
  const userId = await deps.userIdForGame(gameId);
  // A pasted PGN nobody claimed has no "you" to attribute mistakes to.
  if (!userId) return;
  await deps.seedDrillsForGame(userId, gameId);
}

export async function tryStartAnalysis(
  deps: AnalyzeDeps,
  gameId: string,
): Promise<StartAnalysisResult> {
  const game = await deps.getGame(gameId);
  if (!game) return { status: "not-found" };

  const release = await deps.tryAcquireLock(`analysis:${gameId}`);
  if (!release) return { status: "running" };

  // Idempotence after crash-retry: a completed analysis never re-runs.
  const cached = await deps.getAnalysis(gameId);
  if (cached) {
    await release();
    return { status: "completed", analysis: cached };
  }

  const depth = deps.depth ?? 12;
  const engineVersion = deps.engineVersion ?? "stockfish";
  // Identifies this attempt's progress rows. A crashed run's leftovers stay
  // under their own id and readers only ever follow the newest.
  const runId = randomUUID();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  let resolveResult!: (a: GameAnalysisRecord) => void;
  let rejectResult!: (e: unknown) => void;
  const result = new Promise<GameAnalysisRecord>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });
  // Subscribers may never await result directly; terminal errors surface
  // through their iterators too.
  result.catch(() => {});

  const events: AsyncIterable<AnalysisEvent> = {
    [Symbol.asyncIterator]() {
      const iterator = on(emitter, "event", { close: ["end"] });
      return (async function* () {
        for await (const [event] of iterator) yield event as AnalysisEvent;
      })();
    },
  };

  let started = false;
  const start = () => {
    if (started) return;
    started = true;

    void (async () => {
      try {
        const parsed = parsePgn(game.rawPgn)[0];
        if (!parsed) throw new Error(`Game ${gameId} has unparseable PGN`);

        let positions: GradedPly[] = [];
        for await (const event of analyzeGame(parsed, deps.makeSession, { depth })) {
          if (event.type === "done") positions = event.positions;
          if (event.type === "position") {
            // Committed here, one at a time, and deliberately outside the
            // transaction below: a row nobody has committed cannot be read
            // by the connection streaming it. Sequential because each
            // position is a separate durable fact, not a batch.
            // oxlint-disable-next-line eslint/no-await-in-loop
            await deps.appendProgress({
              runId,
              gameId,
              index: event.index,
              total: event.total,
              position: event.position,
            });
          }
          emitter.emit("event", event);
        }

        // Atomic completion: report + judgment severity in one transaction.
        const analysis = await deps.withTransaction(async (tx) => {
          const saved = await deps.saveAnalysis(tx, gameId, {
            engineVersion,
            depth,
            positions,
          });
          const judgments = await deps.listJudgmentsByGame(tx, gameId);
          for (const judgment of judgments) {
            if (judgment.ply === null) continue;
            const signal = engineSignalForDeviation(positions, judgment.ply);
            // Same transaction as the report save — must commit together.
            // oxlint-disable-next-line eslint/no-await-in-loop
            if (signal) await deps.applyEngineSignal(tx, judgment.id, signal);
          }
          return saved;
        });

        // The report supersedes the running commentary.
        await deps.clearProgress(gameId);

        resolveResult(analysis);
        emitter.emit("end");
      } catch (error) {
        rejectResult(error);
        emitter.emit("error", error);
      } finally {
        await release();
      }
    })();
  };

  return {
    status: "started",
    execution: { gameId, events, result, start },
  };
}
