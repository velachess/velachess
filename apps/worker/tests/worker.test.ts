// @vitest-environment node
/**
 * The worker over the real harness: pg-boss delivers, the handlers call
 * the slices, the loop runs sync → analysis in the background. The slice
 * cases below hand deliveries over themselves, composed the way the
 * worker composes them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  abandonSyncJob,
  createSyncJob,
  createUser,
  deleteTrackedAccountAndGames,
  getAnalysis,
  getSyncJobForUser,
  getTrackedAccount,
  getTrackedAccountForUser,
  listGamesPage,
  listGamesWithStatusForAccount,
  updateTrackedAccountCursor,
  insertTrackedAccount,
} from "@velachess/infra-db";
import {
  getSync,
  listGamesWithStatus,
  syncAccount,
  type SyncDeps,
} from "@velachess/accounts";
import { completeAnalysis } from "@velachess/analysis";
import { LOOPER_USERNAME } from "@velachess/fixtures";
import {
  chessComFixtureFetch,
  chessComListingFixtureFetch,
  createLoopHarness,
  deliverSyncJob,
  makeStockfishSession,
  poll,
  type LoopHarness,
} from "@velachess/test-utils";
import { logger } from "@velachess/infra-logger";
import { QUEUES } from "@velachess/infra-queue";

import { buildSyncAccountDeps } from "../src/composition/accounts.ts";
import { buildAnalyzeDeps, type EngineDeps } from "../src/composition/analysis.ts";
import { Worker } from "../src/worker.ts";

let h: LoopHarness;
let analyze: EngineDeps;
let userId: string;
let accountId: string;
const testLogger = logger.child({ component: "test-worker" }, { level: "silent" });

/** A sync job for a fresh user's chess.com handle, recorded and queued as
 * the API does. */
async function newSyncJob(username: string = LOOPER_USERNAME) {
  const user = await createUser(h.db);
  const account = (await insertTrackedAccount(h.db, user.id, "chess_com", username))!;
  return h.db.transaction(async (tx) => {
    const job = (await createSyncJob(tx, {
      userId: user.id,
      accountId: account.id,
      trigger: "manual",
    }))!;
    await h.syncQueue.enqueue(tx, job);
    return job;
  });
}

/** The job's next delivery, as pg-boss hands it to the worker. */
const deliver = (job: { id: string }) => deliverSyncJob(h.boss, job.id);

/** The sync handler's call, composed as `worker.ts` composes it. */
const sync = (deps: SyncDeps, delivery: { id: string; signal: AbortSignal }) =>
  syncAccount(buildSyncAccountDeps(h.db, deps), delivery);

const analyzeGame = (gameId: string) =>
  completeAnalysis(buildAnalyzeDeps(h.db, analyze), gameId);

const bossStateOf = async (job: { id: string }) =>
  (
    await h.pglite.query<{ state: string; retry_count: number }>(
      "select state, retry_count from pgboss.job where name = $1 and id = $2",
      [QUEUES.sync, job.id],
    )
  ).rows[0];

/** The looper archive with its only month failing. */
const brokenMonth: typeof fetch = async (input) =>
  String(input).endsWith("/2026/08")
    ? new Response("unavailable", { status: 503 })
    : chessComFixtureFetch()(input);

const jobOf = (job: { id: string; userId: string }) =>
  getSyncJobForUser(h.db, job.userId, job.id);

/** The job as `GET /syncs/:id` answers it, closing one pg-boss ended. */
const jobAsPolled = (job: { id: string; userId: string }) =>
  getSync(
    {
      getSyncJobForUser: (u, id) => getSyncJobForUser(h.db, u, id),
      isSyncDeliveryLive: (id) => h.syncQueue.isLive(h.db, id),
      abandonSyncJob: (id) => abandonSyncJob(h.db, id),
    },
    job.userId,
    job.id,
  );

/** A fetch that answers only once `release` is called — a delivery held mid-fetch. */
function heldFetch(answer: typeof fetch) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let reached!: () => void;
  const fetching = new Promise<void>((resolve) => (reached = resolve));
  const held = (async (...args: Parameters<typeof fetch>) => {
    reached();
    await released;
    return answer(...args);
  }) as typeof fetch;
  return { held, fetching, release };
}

/** The narrow deps `listGamesWithStatus` declared — composed here the way
 * `apps/server/src/composition/accounts.ts` composes them for the API. */
const gamesWithStatus = (forUser: string, forAccount: string) =>
  listGamesWithStatus(
    {
      getTrackedAccountForUser: (u, a) => getTrackedAccountForUser(h.db, u, a),
      listGamesWithStatusForAccount: (a) => listGamesWithStatusForAccount(h.db, a),
    },
    forUser,
    forAccount,
  );

beforeAll(async () => {
  h = await createLoopHarness();
  analyze = {
    makeSession: makeStockfishSession,
    tryAcquireLock: (key) => h.lock.tryAcquire(key),
    depth: 8,
  };

  // Seed the user's side: a tracked account, as the api would.
  const user = await createUser(h.db);
  userId = user.id;
  const account = (await insertTrackedAccount(
    h.db,
    user.id,
    "chess_com",
    LOOPER_USERNAME,
  ))!;
  accountId = account.id;
}, 120_000);

afterAll(async () => {
  await h.close();
});

describe("worker", () => {
  it("a sync job lands the games — and starts no engine", async () => {
    await new Worker({
      boss: h.boss,
      db: h.db,
      analyze,
      sync: { fetch: chessComFixtureFetch() },
      log: testLogger,
    }).start();
    const job = await createSyncJob(h.db, { userId, accountId, trigger: "manual" });
    await h.syncQueue.enqueue(h.db, job!);

    const games = await poll(async () => {
      const rows = (await gamesWithStatus(userId, accountId))!;
      return rows.length === 2 ? rows : null;
    }, 60_000);
    expect(
      await poll(async () => {
        const settled = await jobOf(job!);
        return settled?.status === "succeeded" ? settled : null;
      }, 30_000),
    ).toMatchObject({ gamesFetched: 2, gamesInserted: 2, errorCode: null });
    expect(
      await poll(async () => {
        const state = await bossStateOf(job!);
        return state?.state === "completed" ? state : null;
      }, 30_000),
    ).toMatchObject({ state: "completed" });

    // Refreshing an archive is a routine, not a fanout: nothing was sent
    // to the engine.
    for (const game of games) {
      expect(await h.analysisQueue.getState(game.id)).toBe("none");
      expect(await getAnalysis(h.db, game.id)).toBeNull();
    }
    // The tests below hand sync deliveries over themselves.
    await h.boss.offWork(QUEUES.sync);
  }, 120_000);

  it("an enqueued analysis job produces a real engine report", async () => {
    // What opening a game does: one deliberate enqueue, one run.
    const games = (await gamesWithStatus(userId, accountId))!;
    const first = games[0]!;
    await h.analysisQueue.enqueue(h.db, first.id);

    const analysis = await poll(() => getAnalysis(h.db, first.id), 60_000);
    expect(analysis.depth).toBe(8);
    expect(analysis.positions.length).toBeGreaterThan(0);
  }, 120_000);

  it("a malformed analysis payload fails the delivery instead of reaching the slice", async () => {
    // The guard runs before the handler and before the log line, so
    // pg-boss owns the retry and then the DLQ.
    const jobId = await h.boss.send(QUEUES.analysis, {} as never);

    const settled = await poll(async () => {
      const job = await h.boss.getJobById(QUEUES.analysis, jobId!);
      return job && job.state !== "created" && job.state !== "active" ? job : null;
    }, 30_000);

    expect(settled.state).not.toBe("completed");
    expect(settled.output).toMatchObject({ message: expect.stringContaining("gameId") });
    await h.boss.offWork(QUEUES.analysis);
  }, 60_000);

  it("an analysis job for an already-analyzed game completes without a second run", async () => {
    const games = (await gamesWithStatus(userId, accountId))!;
    const first = games[0]!;
    const before = await getAnalysis(h.db, first.id);
    // No throw, no re-run: the row already exists.
    await analyzeGame(first.id);
    const after = await getAnalysis(h.db, first.id);
    expect(after!.id).toBe(before!.id);
  });
});

describe("sync deliveries", () => {
  const fixture = { fetch: chessComFixtureFetch() };

  it("a delivery for a job that no longer exists resolves without work", async () => {
    // The account was disconnected after the job was queued: the row went
    // with it, and the delivery has nothing to record. Resolving is what
    // lets pg-boss end it instead of retrying.
    const job = await newSyncJob();
    await deleteTrackedAccountAndGames(h.db, job.accountId);

    await expect(sync(fixture, await deliver(job))).resolves.toBeUndefined();
  });

  it("a settled job delivered again does nothing", async () => {
    const job = await newSyncJob();
    const delivery = await deliver(job);
    await sync(fixture, delivery);
    expect(await jobOf(job)).toMatchObject({ status: "succeeded", gamesInserted: 2 });

    // The same attempt handed over twice — what a consumer that crashed
    // right after its commit, or an operator's redrive, looks like.
    await expect(sync(fixture, delivery)).resolves.toBeUndefined();
    expect(await jobOf(job)).toMatchObject({ status: "succeeded", gamesInserted: 2 });
    expect(await gamesWithStatus(job.userId, job.accountId)).toHaveLength(2);
  });

  it("an incomplete pass is retried; once the retries are spent, polling closes it", async () => {
    const job = await newSyncJob();
    const failing = { fetch: brokenMonth };

    for (const retryCount of [0, 1, 2]) {
      const delivery = await deliver(job);
      expect(await bossStateOf(job)).toMatchObject({ retry_count: retryCount });
      await expect(sync(failing, delivery)).rejects.toThrow(/incomplete/);
      // The row says why; pg-boss decides whether there is another attempt.
      expect(await jobOf(job)).toMatchObject({
        status: "retrying",
        errorCode: "incomplete",
      });
      await h.boss.fail(QUEUES.sync, delivery);
    }
    expect(await bossStateOf(job)).toMatchObject({ state: "failed" });

    // The worker never decides "last attempt": the next read of a job whose
    // delivery pg-boss ended closes it, keeping the reason.
    expect(await jobAsPolled(job)).toMatchObject({
      status: "failed",
      error: { code: "incomplete", retryable: true },
    });
    // No cursor for a pass that never completed — and nothing was saved
    // twice across the attempts.
    expect((await getTrackedAccount(h.db, job.accountId))?.syncCursor).toBeNull();
    expect(await jobOf(job)).toMatchObject({ gamesFetched: 0, gamesInserted: 0 });
  });

  it("a cursor stored in the other provider's shape starts the walk over", async () => {
    // `sync_cursor` is one jsonb column holding either provider's shape.
    // Cast by platform, a Lichess-shaped row reached chess.com with
    // `month === undefined`, which matched no archive month: the pass
    // completed having fetched nothing, and the cursor never advanced.
    const job = await newSyncJob();
    await updateTrackedAccountCursor(h.db, job.accountId, {
      sinceMs: 1_704_067_200_000,
    } as never);
    const unreadable: { accountId: string; platform: string }[] = [];

    await sync(
      { ...fixture, onUnreadableCursor: (info) => unreadable.push(info) },
      await deliver(job),
    );

    expect(await jobOf(job)).toMatchObject({
      status: "succeeded",
      gamesFetched: 2,
      errorCode: null,
    });
    // Reported, not swallowed — a full archive walk otherwise looks routine.
    expect(unreadable).toEqual([{ accountId: job.accountId, platform: "chess_com" }]);
  }, 60_000);

  it("a handle gone from the provider fails for good, keeping the account", async () => {
    const job = await newSyncJob("vanished");
    const gone = {
      fetch: (async () => new Response("", { status: 404 })) as typeof fetch,
    };

    // Resolves: pg-boss has nothing to retry.
    await sync(gone, await deliver(job));

    expect(await jobOf(job)).toMatchObject({ status: "failed", errorCode: "not-found" });
    expect(await getTrackedAccount(h.db, job.accountId)).not.toBeNull();
  });

  it("a delivery cancelled after its last response records the failure and saves nothing", async () => {
    // pg-boss aborts the signal on expiry or a lost claim. The fetch has
    // already answered, so the slice itself has to stop.
    const job = await newSyncJob();
    const deadline = new AbortController();
    const lateFetch = (async (input: RequestInfo | URL) => {
      const response = await chessComFixtureFetch()(input);
      deadline.abort(new Error("delivery expired"));
      return response;
    }) as typeof fetch;

    await expect(
      sync({ fetch: lateFetch }, { ...(await deliver(job)), signal: deadline.signal }),
    ).rejects.toThrow(/expired/);

    expect(await jobOf(job)).toMatchObject({ status: "retrying", errorCode: "internal" });
    expect(await gamesWithStatus(job.userId, job.accountId)).toEqual([]);
  });

  it("a delivery cancelled mid-fetch stops at the provider", async () => {
    // The provider hands pg-boss's signal to fetch: an abort while a request
    // is in flight rejects there, before any archive page is read.
    const job = await newSyncJob();
    const deadline = new AbortController();
    const honoring = (async (input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return chessComFixtureFetch()(input);
    }) as typeof fetch;
    deadline.abort(new Error("delivery expired"));

    await expect(
      sync({ fetch: honoring }, { ...(await deliver(job)), signal: deadline.signal }),
    ).rejects.toThrow(/expired/);

    expect(await jobOf(job)).toMatchObject({ status: "retrying", errorCode: "internal" });
    expect(await gamesWithStatus(job.userId, job.accountId)).toEqual([]);
  });

  it("a delivery that lost the job to a retry writes nothing", async () => {
    const job = await newSyncJob();
    // The stale delivery would bring a different archive: anything of it
    // that lands is visible.
    const stale = heldFetch(chessComListingFixtureFetch());
    const current = heldFetch(chessComFixtureFetch());

    // The first delivery starts, then stalls in its fetch...
    const first = sync({ fetch: stale.held }, await deliver(job));
    await stale.fetching;
    // ...pg-boss takes the job back, as its supervisor does on a missed
    // heartbeat or expiry, and hands it to a retry that marks the job
    // running again — the row now carries the retry's stamp.
    await h.boss.fail(QUEUES.sync, job.id, new Error("heartbeat timeout"));
    const second = sync({ fetch: current.held }, await deliver(job));
    await current.fetching;

    // The first wakes up and commits: its stamp is gone, so its games,
    // cursor, sync time and status all miss the row.
    stale.release();
    await first;
    expect(await gamesWithStatus(job.userId, job.accountId)).toEqual([]);
    expect((await getTrackedAccount(h.db, job.accountId))?.lastSyncedAt).toBeNull();
    expect(await jobOf(job)).toMatchObject({ status: "running", gamesInserted: null });

    current.release();
    await second;
    expect(await jobOf(job)).toMatchObject({ status: "succeeded", gamesInserted: 2 });
  });

  it("a dead-lettered sync retried by an operator runs again and recovers", async () => {
    // What the dashboard's "retry" on the failed job does: the job keeps
    // its id — the sync job's id — so the row, still `retrying`, picks up
    // where it left off once the provider answers.
    const job = await newSyncJob();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const delivery = await deliver(job);
      await expect(sync({ fetch: brokenMonth }, delivery)).rejects.toThrow(/incomplete/);
      await h.boss.fail(QUEUES.sync, delivery);
    }
    expect(await bossStateOf(job)).toMatchObject({ state: "failed" });
    // The dead letter is the copy an operator sees.
    expect(await h.boss.findJobs(QUEUES.syncDlq)).toContainEqual(
      expect.objectContaining({ sourceId: job.id }),
    );

    await h.boss.retry(QUEUES.sync, job.id);
    await sync(fixture, await deliver(job));
    expect(await jobOf(job)).toMatchObject({
      status: "succeeded",
      errorCode: null,
      gamesInserted: 2,
    });
  });

  it("redriving the sync dead-letter queue cannot revive a sync", async () => {
    // A redrive mints a new job id; the slice resolves it to no sync job
    // and the delivery completes without work. The operator's move is the
    // retry above.
    const job = await newSyncJob();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const delivery = await deliver(job);
      await expect(sync({ fetch: brokenMonth }, delivery)).rejects.toThrow(/incomplete/);
      await h.boss.fail(QUEUES.sync, delivery);
    }

    // The dead-letter queue holds every sync this file let die; the
    // redriven copy of this one is told apart by its singleton key.
    expect(await h.boss.redrive(QUEUES.syncDlq)).toBeGreaterThanOrEqual(1);
    const redriven = await h.boss.fetch(QUEUES.sync, {
      batchSize: 50,
      ignoreStartAfter: true,
      includeMetadata: true,
    });
    const copy = redriven.find((candidate) => candidate.singletonKey === job.accountId);
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe(job.id);

    await expect(
      sync(fixture, { id: copy!.id, signal: new AbortController().signal }),
    ).resolves.toBeUndefined();
    expect(await jobOf(job)).toMatchObject({
      status: "retrying",
      errorCode: "incomplete",
    });
    await h.boss.complete(QUEUES.sync, redriven);
  });

  it("retrying a job polling already closed does nothing", async () => {
    const job = await newSyncJob();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const delivery = await deliver(job);
      await expect(sync({ fetch: brokenMonth }, delivery)).rejects.toThrow(/incomplete/);
      await h.boss.fail(QUEUES.sync, delivery);
    }
    expect(await jobAsPolled(job)).toMatchObject({ status: "failed" });

    await h.boss.retry(QUEUES.sync, job.id);
    await expect(sync(fixture, await deliver(job))).resolves.toBeUndefined();
    expect(await jobOf(job)).toMatchObject({ status: "failed", errorCode: "incomplete" });
    expect(await gamesWithStatus(job.userId, job.accountId)).toEqual([]);
  });

  it("an account deleted mid-sync gets no games back", async () => {
    const job = await newSyncJob();
    const held = heldFetch(chessComFixtureFetch());

    const syncing = sync({ fetch: held.held }, await deliver(job));
    await held.fetching;
    await deleteTrackedAccountAndGames(h.db, job.accountId);
    held.release();
    // Resolves: the row went with the account, pg-boss ends the delivery.
    await syncing;

    expect(await getTrackedAccount(h.db, job.accountId)).toBeNull();
    expect(await jobOf(job)).toBeNull();
    // Not even an orphan with its account nulled.
    expect((await listGamesPage(h.db, job.userId)).total).toBe(0);
  });
});

describe("analysis deliveries", () => {
  it("a dead-lettered analysis job redrives with its payload intact", async () => {
    // Unlike sync, the analysis payload says which game: a redrive from
    // the dashboard puts a deliverable job back on the queue.
    const games = (await gamesWithStatus(userId, accountId))!;
    const gameId = games[0]!.id;
    // Ahead of whatever this file left on the queue; priority survives the redrive.
    const priority = 9_999_999;
    const id = await h.boss.send(
      QUEUES.analysis,
      { gameId },
      { retryLimit: 0, priority },
    );
    const [delivery] = await h.boss.fetch(QUEUES.analysis, {
      ignoreStartAfter: true,
      minPriority: priority,
    });
    expect(delivery?.id).toBe(id);
    await h.boss.fail(QUEUES.analysis, delivery!, new Error("engine crashed"));
    expect(await h.boss.findJobs(QUEUES.analysisDlq)).toContainEqual(
      expect.objectContaining({ sourceId: id, data: { gameId } }),
    );

    expect(await h.boss.redrive(QUEUES.analysisDlq)).toBe(1);
    const [redriven] = await h.boss.fetch<{ gameId: string }>(QUEUES.analysis, {
      ignoreStartAfter: true,
      minPriority: priority,
    });
    expect(redriven?.data).toEqual({ gameId });
    await h.boss.complete(QUEUES.analysis, redriven!);
  });

  it("running with no persisted report throws — the retry schedule owns the wait", async () => {
    // An "interactive" holder owns the lock and hasn't persisted: the
    // delivery must fail (for pg-boss to redeliver later), never complete.
    const games = (await gamesWithStatus(userId, accountId))!;
    const second = games[1]!;
    const release = await h.lock.tryAcquire(`analysis:${second.id}`);
    expect(release).not.toBeNull();

    await expect(analyzeGame(second.id)).rejects.toThrow(/running elsewhere/);
    expect(await getAnalysis(h.db, second.id)).toBeNull();

    // The holder vanished without persisting — the redelivery (here: the
    // next call) takes over and finishes the work.
    await release!();
    await analyzeGame(second.id);
    expect((await getAnalysis(h.db, second.id))?.positions.length).toBeGreaterThan(0);
  }, 60_000);

  it("running while the holder's report already landed completes the delivery", async () => {
    // The first game is analyzed; a held lock plus a persisted report means
    // the operation is satisfied, so the delivery completes.
    const games = (await gamesWithStatus(userId, accountId))!;
    const first = games[0]!;
    const release = await h.lock.tryAcquire(`analysis:${first.id}`);
    expect(release).not.toBeNull();

    await analyzeGame(first.id);
    await release!();
  });
});
