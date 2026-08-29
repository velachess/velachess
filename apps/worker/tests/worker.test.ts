// @vitest-environment node
/**
 * Worker consumers over the real harness: pg-boss delivers, consumers call
 * application, the loop runs sync → judge → analysis in the background.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addChapter,
  createRepertoire,
  createUser,
  getAnalysis,
  upsertTrackedAccount,
} from "@velachess/db";
import { listGamesWithStatus } from "@velachess/application/accounts/list-account-games/list-account-games";
import { LOOPER_REPERTOIRE_PGN, LOOPER_USERNAME } from "@velachess/fixtures";
import {
  chessComFixtureFetch,
  createLoopHarness,
  makeStockfishSession,
  poll,
  type LoopHarness,
} from "@velachess/test-utils";
import { logger } from "@velachess/logger";

import { registerConsumers, type WorkerDeps } from "../src/worker.ts";
import { consumeAnalysisJob } from "../src/consumers/analysis.ts";
import { consumeSyncJob } from "../src/consumers/accounts.ts";

let h: LoopHarness;
let deps: WorkerDeps;
let accountId: string;
const testLogger = logger.child({ component: "test-worker" }, { level: "silent" });

beforeAll(async () => {
  h = await createLoopHarness();
  deps = {
    db: h.db,
    analyze: { makeSession: makeStockfishSession, lock: h.lock, depth: 8 },
    analysisQueue: h.analysisQueue,
    sync: { fetch: chessComFixtureFetch() },
    log: testLogger,
  };

  // Seed the user's side: repertoire + tracked account, as the api would.
  const user = await createUser(h.db);
  const account = await upsertTrackedAccount(h.db, user.id, "chess_com", LOOPER_USERNAME);
  accountId = account.id;
  const repertoire = await createRepertoire(h.db, {
    userId: user.id,
    name: "White e4",
    color: "white",
  });
  await addChapter(h.db, {
    repertoireId: repertoire.id,
    name: "French",
    pgn: LOOPER_REPERTOIRE_PGN,
    sortOrder: 0,
  });
}, 120_000);

afterAll(async () => {
  await h.close();
});

describe("worker consumers", () => {
  it("a sync job lands and judges the games — and starts no engine", async () => {
    await registerConsumers(h.boss, deps);
    await h.syncQueue.enqueue(h.db, accountId);

    // sync consumer: games land and are judged (replay, not Stockfish)
    const games = await poll(async () => {
      const rows = await listGamesWithStatus(h.db, accountId);
      return rows.length === 2 && rows.every((r) => r.judgmentType !== null)
        ? rows
        : null;
    }, 60_000);
    const deviant = games.find((g) => g.judgmentType === "deviation")!;
    expect(deviant).toBeDefined();

    // Refreshing an archive is a routine, not a fanout: the deviation is
    // recorded and nothing was sent to the engine.
    expect(await h.analysisQueue.getState(deviant.id)).toBe("none");
    expect(await getAnalysis(h.db, deviant.id)).toBeNull();
  }, 120_000);

  it("an enqueued analysis job produces a real engine report", async () => {
    // What opening a game does: one deliberate enqueue, one run.
    const games = await listGamesWithStatus(h.db, accountId);
    const deviant = games.find((g) => g.judgmentType === "deviation")!;
    await h.analysisQueue.enqueue(h.db, deviant.id);

    const analysis = await poll(() => getAnalysis(h.db, deviant.id), 60_000);
    expect(analysis.depth).toBe(8);
    expect(analysis.positions.length).toBeGreaterThan(0);
  }, 120_000);

  it("an analysis job for an already-analyzed game completes without a second run", async () => {
    const games = await listGamesWithStatus(h.db, accountId);
    const deviant = games.find((g) => g.judgmentType === "deviation")!;
    const before = await getAnalysis(h.db, deviant.id);
    await consumeAnalysisJob(deps, { gameId: deviant.id }); // no throw, no re-run
    const after = await getAnalysis(h.db, deviant.id);
    expect(after!.id).toBe(before!.id);
  });

  it("a sync job for a missing account throws — pg-boss owns the retry", async () => {
    await expect(
      consumeSyncJob(deps, { accountId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow(/not found/);
  });

  it("running with no persisted report throws — the retry schedule owns the wait", async () => {
    // An "interactive" holder owns the lock and hasn't persisted: the
    // delivery must fail (for pg-boss to redeliver later), never complete.
    const games = await listGamesWithStatus(h.db, accountId);
    const inBook = games.find((g) => g.judgmentType !== "deviation")!;
    const release = await h.lock.tryAcquire(`analysis:${inBook.id}`);
    expect(release).not.toBeNull();

    await expect(consumeAnalysisJob(deps, { gameId: inBook.id })).rejects.toThrow(
      /running elsewhere/,
    );
    expect(await getAnalysis(h.db, inBook.id)).toBeNull();

    // The holder vanished without persisting — the redelivery (here: the
    // next consume call) takes over and finishes the work.
    await release!();
    await consumeAnalysisJob(deps, { gameId: inBook.id });
    expect((await getAnalysis(h.db, inBook.id))?.positions.length).toBeGreaterThan(0);
  }, 60_000);

  it("running while the holder's report already landed completes the delivery", async () => {
    // The deviant is analyzed; a held lock plus a persisted report means
    // the holder finished — the delivery is satisfied without a throw.
    const games = await listGamesWithStatus(h.db, accountId);
    const deviant = games.find((g) => g.judgmentType === "deviation")!;
    const release = await h.lock.tryAcquire(`analysis:${deviant.id}`);
    expect(release).not.toBeNull();

    await consumeAnalysisJob(deps, { gameId: deviant.id }); // no throw
    await release!();
  }, 30_000);
});
