// @vitest-environment node
/**
 * The worker over the real harness: pg-boss delivers, the handler calls
 * the sync slice, the loop runs in the background. The slice cases below
 * hand deliveries over themselves, composed the way the worker composes
 * them. Analysis has no worker handler — it runs browser-side.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  abandonSyncJob,
  createSyncJob,
  createUser,
  deleteTrackedAccountAndGames,
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
import { LOOPER_USERNAME } from "@velachess/fixtures";
import {
  chessComFixtureFetch,
  chessComListingFixtureFetch,
  createLoopHarness,
  deliverSyncJob,
  poll,
  type LoopHarness,
} from "@velachess/test-utils";
import { logger } from "@velachess/infra-logger";
import { QUEUES } from "@velachess/infra-queue";

import { buildSyncAccountDeps } from "../src/composition/accounts.ts";
import { Worker } from "../src/worker.ts";

let h: LoopHarness;
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
    await h.syncQueue.enqueue(tx, { ...job, platform: account.platform });
    return job;
  });
}

/** The job's next delivery, as pg-boss hands it to the worker. */
const deliver = (job: { id: string }) => deliverSyncJob(h.boss, job.id);

/** The sync handler's call, composed as `worker.ts` composes it. */
const sync = (deps: SyncDeps, delivery: { id: string; signal: AbortSignal }) =>
  syncAccount(buildSyncAccountDeps(h.db, deps), delivery);

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

/** Three archive months, two games apiece, each tracked by its own call
 * count — so a test can assert a checkpointed month is never re-fetched.
 * Each month plays different moves: dedup keys on the movetext hash, and
 * `LOOPER_LOSS_PGN`/`LOOPER_WIN_PGN` repeated verbatim across months would
 * collide as "the same game" instead of landing as six distinct rows. */
const MULTI_MONTH_ARCHIVES = ["2026/06", "2026/07", "2026/08"];
const MULTI_MONTH_OPENINGS = [
  "1. e4 e6 2. g4 d5",
  "1. d4 d5 2. c4 e6",
  "1. Nf3 Nf6 2. c4 g6",
];
function multiMonthFetch(opts: { failMonth?: string } = {}) {
  const calls = new Map(MULTI_MONTH_ARCHIVES.map((month) => [month, 0]));
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/pub\/player\/[^/]+$/.test(url)) return Response.json({});
    if (url.endsWith("/archives")) {
      return Response.json({
        archives: MULTI_MONTH_ARCHIVES.map(
          (month) => `https://api.chess.com/pub/player/${LOOPER_USERNAME}/games/${month}`,
        ),
      });
    }
    const monthIndex = MULTI_MONTH_ARCHIVES.findIndex((candidate) =>
      url.endsWith(candidate),
    );
    if (monthIndex === -1) return new Response("not found", { status: 404 });
    const month = MULTI_MONTH_ARCHIVES[monthIndex]!;
    calls.set(month, (calls.get(month) ?? 0) + 1);
    if (month === opts.failMonth) return new Response("unavailable", { status: 503 });
    const opening = MULTI_MONTH_OPENINGS[monthIndex]!;
    return Response.json({
      games: [
        {
          url: `https://www.chess.com/game/live/${month}-1`,
          pgn: `[Event "Live Chess"]\n[White "looper"]\n[Black "rival"]\n[Result "0-1"]\n\n${opening} 0-1\n`,
          rules: "chess",
          end_time: 1,
        },
        {
          url: `https://www.chess.com/game/live/${month}-2`,
          pgn: `[Event "Live Chess"]\n[White "looper"]\n[Black "rival"]\n[Result "1-0"]\n\n${opening} 1-0\n`,
          rules: "chess",
          end_time: 2,
        },
      ],
    });
  }) as typeof fetch;
  return { fetch: fetchFn, calls };
}

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
  it("a sync job lands the games", async () => {
    await new Worker({
      boss: h.boss,
      db: h.db,
      sync: { fetch: chessComFixtureFetch() },
      log: testLogger,
    }).start();
    const job = await createSyncJob(h.db, { userId, accountId, trigger: "manual" });
    await h.syncQueue.enqueue(h.db, { ...job!, platform: "chess_com" });

    await poll(async () => {
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

    // The tests below hand sync deliveries over themselves.
    await h.boss.offWork(QUEUES.sync);
  }, 120_000);
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

  it("a delivery cancelled after its last response keeps the month it already checkpointed", async () => {
    // pg-boss aborts the signal on expiry or a lost claim. The fetch has
    // already answered, so the slice itself has to stop — but the fixture's
    // one archive month committed as a checkpoint before that cancellation
    // was even observed, so it survives the retry this records.
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
    expect(await gamesWithStatus(job.userId, job.accountId)).toHaveLength(2);
    expect((await getTrackedAccount(h.db, job.accountId))?.syncCursor).not.toBeNull();
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

  it("resumes from its checkpoint: a month already synced is never re-fetched", async () => {
    const job = await newSyncJob();
    const crashing = multiMonthFetch({ failMonth: "2026/08" });

    // Months 06 and 07 each checkpoint in turn; 08 fails, so the pass is
    // incomplete — but the cursor already sits past 07, not at the start.
    const firstDelivery = await deliver(job);
    await expect(sync({ fetch: crashing.fetch }, firstDelivery)).rejects.toThrow(
      /incomplete/,
    );
    expect(await jobOf(job)).toMatchObject({
      status: "retrying",
      errorCode: "incomplete",
    });
    expect(await gamesWithStatus(job.userId, job.accountId)).toHaveLength(4);
    expect((await getTrackedAccount(h.db, job.accountId))?.syncCursor).toMatchObject({
      month: "2026/07",
    });
    expect(crashing.calls.get("2026/06")).toBe(1);
    expect(crashing.calls.get("2026/07")).toBe(1);
    await h.boss.fail(QUEUES.sync, firstDelivery);

    // The retry resumes from the cursor: 06 is never touched again. (07 is
    // re-walked — the boundary month an archive can still append to — 08
    // finally succeeds.)
    const recovered = multiMonthFetch();
    await expect(
      sync({ fetch: recovered.fetch }, await deliver(job)),
    ).resolves.toBeUndefined();

    expect(await jobOf(job)).toMatchObject({
      status: "succeeded",
      errorCode: null,
      gamesInserted: 6,
    });
    expect(await gamesWithStatus(job.userId, job.accountId)).toHaveLength(6);
    expect((await getTrackedAccount(h.db, job.accountId))?.syncCursor).toMatchObject({
      month: "2026/08",
    });
    expect(recovered.calls.get("2026/06")).toBe(0);
    expect(recovered.calls.get("2026/07")).toBe(1);
    expect(recovered.calls.get("2026/08")).toBe(1);
  });

  it("a throttled provider ends the pass without reaching the network", async () => {
    const job = await newSyncJob();
    let fetchCalls = 0;
    const countingFetch = (async (...args: Parameters<typeof fetch>) => {
      fetchCalls += 1;
      return fixture.fetch(...args);
    }) as typeof fetch;

    await expect(
      sync(
        {
          fetch: countingFetch,
          consumeProviderRateLimit: () =>
            Promise.resolve({ allowed: false, retryAfterSeconds: 1 }),
        },
        await deliver(job),
      ),
    ).rejects.toThrow(/throttled/);

    expect(fetchCalls).toBe(0);
    expect(await jobOf(job)).toMatchObject({ status: "retrying", errorCode: "internal" });
    expect(await gamesWithStatus(job.userId, job.accountId)).toEqual([]);
  });
});
