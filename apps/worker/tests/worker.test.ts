// @vitest-environment node
/**
 * Worker consumers over the real harness: pg-boss delivers, consumers call
 * application, the loop runs sync → analysis in the background.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
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
import { listGamesWithStatus } from "@velachess/accounts";
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

import { registerConsumers, type WorkerDeps } from "../src/worker.ts";
import { consumeAnalysisJob } from "../src/consumers/analysis.ts";
import { consumeSyncJob } from "../src/consumers/accounts.ts";

let h: LoopHarness;
let deps: WorkerDeps;
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
  deps = {
    db: h.db,
    syncQueue: h.syncQueue,
    analyze: {
      makeSession: makeStockfishSession,
      tryAcquireLock: (key) => h.lock.tryAcquire(key),
      depth: 8,
    },
    sync: { fetch: chessComFixtureFetch() },
    log: testLogger,
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

describe("worker consumers", () => {
  it("a sync job lands the games — and starts no engine", async () => {
    await registerConsumers(h.boss, deps);
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

  it("an analysis job for an already-analyzed game completes without a second run", async () => {
    const games = (await gamesWithStatus(userId, accountId))!;
    const first = games[0]!;
    const before = await getAnalysis(h.db, first.id);
    await consumeAnalysisJob(deps, { gameId: first.id }); // no throw, no re-run
    const after = await getAnalysis(h.db, first.id);
    expect(after!.id).toBe(before!.id);
  });

  it("a delivery for a job that no longer exists completes without work", async () => {
    const gone = "00000000-0000-0000-0000-000000000000";
    await expect(
      consumeSyncJob(deps, {
        id: gone,
        data: { syncJobId: gone, accountId: gone },
        retryCount: 0,
        retryLimit: 2,
        signal: new AbortController().signal,
      }),
    ).resolves.toBeUndefined();
  });

  it("an incomplete pass is retried, and fails once the retries are spent", async () => {
    const job = await newSyncJob();
    const failing = { ...deps, sync: { fetch: brokenMonth } };

    for (const retryCount of [0, 1]) {
      const delivery = await deliver(job);
      expect(delivery.retryCount).toBe(retryCount);
      await expect(consumeSyncJob(failing, delivery)).rejects.toThrow(/incomplete/);
      expect(await jobOf(job)).toMatchObject({
        status: "retrying",
        errorCode: "incomplete",
      });
      expect(await bossStateOf(job)).toMatchObject({ state: "retry" });
    }

    await expect(consumeSyncJob(failing, await deliver(job))).rejects.toThrow(
      /incomplete/,
    );
    expect(await jobOf(job)).toMatchObject({ status: "failed", errorCode: "incomplete" });
    expect(await bossStateOf(job)).toMatchObject({ state: "failed" });
    // No cursor for a pass that never completed.
    expect((await getTrackedAccount(h.db, job.accountId))?.syncCursor).toBeNull();
  });

  it("a malformed payload fails the delivery instead of reaching the slice", async () => {
    // What `{}` used to do: `processSync` read `syncJobId: undefined` and
    // asked the database for it. The guard runs before the handler and
    // before the log line, so pg-boss owns the retry and then the DLQ.
    await registerConsumers(h.boss, deps);
    const jobId = await h.boss.send(QUEUES.sync, {} as never);

    const settled = await poll(async () => {
      const job = await h.boss.getJobById(QUEUES.sync, jobId!);
      return job && job.state !== "created" && job.state !== "active" ? job : null;
    }, 30_000);

    expect(settled.state).not.toBe("completed");
    expect(settled.output).toMatchObject({
      message: expect.stringContaining("payload"),
    });
    await h.boss.offWork(QUEUES.sync);
  }, 60_000);

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

    await consumeSyncJob(
      { ...deps, sync: { ...deps.sync, onUnreadableCursor: (i) => unreadable.push(i) } },
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
      ...deps,
      sync: { fetch: (async () => new Response("", { status: 404 })) as typeof fetch },
    };

    // Resolves: pg-boss has nothing to retry.
    await consumeSyncJob(gone, await deliver(job));

    expect(await jobOf(job)).toMatchObject({ status: "failed", errorCode: "not-found" });
    expect(await bossStateOf(job)).toMatchObject({ state: "completed" });
    expect(await getTrackedAccount(h.db, job.accountId)).not.toBeNull();
  });

  it("a delivery that outlives its deadline records the failure and saves nothing", async () => {
    const job = await newSyncJob();
    const deadline = new AbortController();
    const lateFetch = (async (input: RequestInfo | URL) => {
      const response = await chessComFixtureFetch()(input);
      deadline.abort(new Error("delivery expired"));
      return response;
    }) as typeof fetch;

    await expect(
      consumeSyncJob(
        { ...deps, sync: { fetch: lateFetch } },
        { ...(await deliver(job)), signal: deadline.signal },
      ),
    ).rejects.toThrow(/expired/);

    expect(await jobOf(job)).toMatchObject({ status: "retrying", errorCode: "internal" });
    expect(await gamesWithStatus(job.userId, job.accountId)).toEqual([]);
  });

  it("a delivery that lost the job to a retry writes nothing, nor settles the retry", async () => {
    const job = await newSyncJob();
    // The stale delivery would bring a different archive: anything of it
    // that lands is visible.
    const stale = heldFetch(chessComListingFixtureFetch());
    const current = heldFetch(chessComFixtureFetch());

    // The first delivery starts, then stalls in its fetch...
    const first = consumeSyncJob(
      { ...deps, sync: { fetch: stale.held } },
      await deliver(job),
    );
    await stale.fetching;
    // ...pg-boss takes the job back, as its supervisor does on a missed
    // heartbeat or expiry, and hands it to a retry that is still fetching.
    await h.boss.fail(QUEUES.sync, job.id, new Error("heartbeat timeout"));
    const second = consumeSyncJob(
      { ...deps, sync: { fetch: current.held } },
      await deliver(job),
    );
    await current.fetching;

    // The first wakes up and tries to commit: pg-boss refuses its settle,
    // so its games, cursor, sync time and status roll back.
    stale.release();
    await expect(first).rejects.toThrow(/lost the job/);
    expect(await gamesWithStatus(job.userId, job.accountId)).toEqual([]);
    expect((await getTrackedAccount(h.db, job.accountId))?.lastSyncedAt).toBeNull();
    expect(await jobOf(job)).toMatchObject({ status: "running", gamesInserted: null });
    expect(await bossStateOf(job)).toEqual({ state: "active", retry_count: 1 });

    current.release();
    await second;
    expect(await jobOf(job)).toMatchObject({ status: "succeeded", gamesInserted: 2 });
    expect(await bossStateOf(job)).toMatchObject({ state: "completed" });
  });

  it("an account deleted mid-sync gets no games back", async () => {
    const job = await newSyncJob();
    const held = heldFetch(chessComFixtureFetch());

    const syncing = consumeSyncJob(
      { ...deps, sync: { fetch: held.held } },
      await deliver(job),
    );
    await held.fetching;
    await deleteTrackedAccountAndGames(h.db, job.accountId);
    held.release();
    await syncing;

    expect(await getTrackedAccount(h.db, job.accountId)).toBeNull();
    expect(await jobOf(job)).toBeNull();
    // Not even an orphan with its account nulled.
    expect((await listGamesPage(h.db, job.userId)).total).toBe(0);
  });

  it("running with no persisted report throws — the retry schedule owns the wait", async () => {
    // An "interactive" holder owns the lock and hasn't persisted: the
    // delivery must fail (for pg-boss to redeliver later), never complete.
    const games = (await gamesWithStatus(userId, accountId))!;
    const second = games[1]!;
    const release = await h.lock.tryAcquire(`analysis:${second.id}`);
    expect(release).not.toBeNull();

    await expect(consumeAnalysisJob(deps, { gameId: second.id })).rejects.toThrow(
      /running elsewhere/,
    );
    expect(await getAnalysis(h.db, second.id)).toBeNull();

    // The holder vanished without persisting — the redelivery (here: the
    // next consume call) takes over and finishes the work.
    await release!();
    await consumeAnalysisJob(deps, { gameId: second.id });
    expect((await getAnalysis(h.db, second.id))?.positions.length).toBeGreaterThan(0);
  }, 60_000);

  it("running while the holder's report already landed completes the delivery", async () => {
    // The first game is analyzed; a held lock plus a persisted report means
    // the holder finished — the delivery is satisfied without a throw.
    const games = (await gamesWithStatus(userId, accountId))!;
    const first = games[0]!;
    const release = await h.lock.tryAcquire(`analysis:${first.id}`);
    expect(release).not.toBeNull();

    await consumeAnalysisJob(deps, { gameId: first.id }); // no throw
    await release!();
  }, 30_000);
});
