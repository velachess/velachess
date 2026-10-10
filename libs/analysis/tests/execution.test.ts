// @vitest-environment node
/**
 * process-analysis's own execution contract — TOCTOU, disconnect vs.
 * cancel, and how request-analysis composes states around it — against
 * the real harness (PGlite + migrations + advisory lock, Stockfish real).
 * These exercise `tryStartAnalysis`'s locking/streaming contract, which
 * is private to this module, so they live with the slice that owns it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@velachess/infra-db";
import {
  appendProgress,
  clearProgress,
  createUser,
  games,
  getAnalysis,
  getGame,
  getGameForUser,
  saveAnalysis,
} from "@velachess/infra-db";
import { requestAnalysis, type RequestAnalysisDeps } from "@velachess/analysis";
import type { AnalysisQueue } from "@velachess/infra-queue";
import {
  createLoopHarness,
  makeStockfishSession as makeSession,
  type LoopHarness,
} from "@velachess/test-utils";

// tryStartAnalysis is private to this module (the public surface is
// completeAnalysis, which hides the execution/events this file asserts
// on) — reached here via relative path, the ordinary way a slice's own
// test reaches its sibling implementation file.
import { tryStartAnalysis } from "../process-analysis/process-analysis.ts";
import type { AnalyzeDeps } from "../process-analysis/process-analysis.ts";

let h: LoopHarness;
let userId: string;
let gameId: string;

async function insertGame(db: Database, owner: string, rawPgn: string, hash: string) {
  const [game] = await db
    .insert(games)
    .values({
      userId: owner,
      source: "pgn",
      whiteName: "w",
      blackName: "b",
      result: "*",
      hasClocks: false,
      rawPgn,
      movetextHash: hash,
    })
    .returning();
  return game!;
}

function analyzeDeps(db: Database, lock: LoopHarness["lock"]): AnalyzeDeps {
  return {
    makeSession,
    tryAcquireLock: (key) => lock.tryAcquire(key),
    getGame: (id) => getGame(db, id),
    getAnalysis: (id) => getAnalysis(db, id),
    withTransaction: (fn) => db.transaction(fn),
    saveAnalysis: (tx, id, data) => saveAnalysis(tx, id, data),
    appendProgress: (entry) => appendProgress(db, entry),
    clearProgress: (id) => clearProgress(db, id),
    depth: 8,
  };
}

function requestAnalysisDeps(db: Database, queue: AnalysisQueue): RequestAnalysisDeps {
  return {
    getGame: (id) => getGame(db, id),
    getGameForUser: (forUserId, id) => getGameForUser(db, forUserId, id),
    getAnalysis: (id) => getAnalysis(db, id),
    getQueueState: (id) => queue.getState(id),
    enqueueAnalysis: (id) => queue.enqueue(db, id),
  };
}

beforeAll(async () => {
  h = await createLoopHarness();
  userId = (await createUser(h.db)).id;
  gameId = (await insertGame(h.db, userId, "1. e4 e6 2. Nf3 d5 *", "execution")).id;
});

afterAll(() => h.close());

describe("process-analysis execution", () => {
  it("TOCTOU — two concurrent tryStart, exactly one starts", async () => {
    const deps = analyzeDeps(h.db, h.lock);
    const [a, b] = await Promise.all([
      tryStartAnalysis(deps, gameId),
      tryStartAnalysis(deps, gameId),
    ]);
    const statuses = [a.status, b.status].toSorted();
    expect(statuses).toEqual(["running", "started"]);

    const started = (a.status === "started" ? a : b) as Extract<
      typeof a,
      { status: "started" }
    >;

    // subscribe BEFORE start — first event must be index 0
    const seen: number[] = [];
    const consume = (async () => {
      for await (const event of started.execution.events) {
        if (event.type === "position") seen.push(event.index);
      }
    })();

    started.execution.start();
    const analysis = await started.execution.result;
    await consume;

    expect(seen[0]).toBe(0); // never lost the first event
    expect(analysis.positions.length).toBe(4);

    expect(await getAnalysis(h.db, gameId)).not.toBeNull();
  }, 120_000);

  it("disconnect ≠ cancel — aborted subscriber, result still persists", async () => {
    // fresh game without analysis
    const game = await insertGame(h.db, userId, "1. e4 e5 *", "sse-abort");

    const start = await tryStartAnalysis(analyzeDeps(h.db, h.lock), game.id);
    expect(start.status).toBe("started");
    const execution = (start as Extract<typeof start, { status: "started" }>).execution;

    // subscriber that abandons after the first event
    const abandoned = (async () => {
      for await (const event of execution.events) break;
    })();

    execution.start();
    await abandoned; // subscriber gone mid-flight
    const analysis = await execution.result; // execution continued regardless
    expect(analysis.positions.length).toBe(2);
    expect(await getAnalysis(h.db, game.id)).not.toBeNull();
  }, 120_000);

  it("completed short-circuits, requestAnalysis composes states", async () => {
    const again = await tryStartAnalysis(analyzeDeps(h.db, h.lock), gameId);
    expect(again.status).toBe("completed");

    const reqDeps = requestAnalysisDeps(h.db, h.analysisQueue);
    const request = await requestAnalysis(reqDeps, gameId);
    expect(request.status).toBe("completed");

    const missing = await requestAnalysis(
      reqDeps,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(missing.status).toBe("not-found");
  });
});
