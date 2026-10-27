// @vitest-environment node
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

/** Recorded and queued as the API does. */
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

const deliver = (job: { id: string }) => deliverSyncJob(h.boss, job.id);

const sync = (deps: SyncDeps, delivery: { id: string; signal: AbortSignal }) =>
  syncAccount(buildSyncAccountDeps(h.db, deps), delivery);

const bossStateOf = async (job: { id: string }) =>
  (
    await h.pglite.query<{ state: string; retry_count: number }>(
      "select state, retry_count from pgboss.job where name = $1 and id = $2",
      [QUEUES.sync, job.id],
    )
  ).rows[0];

const brokenMonth: typeof fetch = async (input) =>
  String(input).endsWith("/2026/08")
    ? new Response("unavailable", { status: 503 })
    : chessComFixtureFetch()(input);

/** Three months, two games apiece, each with its own call count so a test
 * can assert a checkpointed month is never re-fetched. The moves differ per
 * month because dedup keys on the movetext hash. */
const MULTI_MONTH_ARCHIVES = ["2026/06", "2026/07", "2026/08"];
const MULTI_MONTH_OPENINGS = [
  "1. e4 e6 2. g4 d5",
  "1. d4 d5 2. c4 e6",
  "1. Nf3 Nf6 2. c4 g6",
];
function multiMonthFetch(opts: { failMonth?: string } = {}) {
  const calls = new Map(MULTI_MONTH_ARCHIVES.map((month) => [month, 0]));
  const fetchFn: typeof fetch = async (input) => {
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
  };
  return { fetch: fetchFn, calls };
}

const jobOf = (job: { id: string; userId: string }) =>
  getSyncJobForUser(h.db, job.userId, job.id);

/** As `GET /syncs/:id` answers it, closing one pg-boss ended. */
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

const signalHonoringFetch: typeof fetch = async (input, init) => {
  init?.signal?.throwIfAborted();
  return chessComFixtureFetch()(input);
};

function heldFetch(answer: typeof fetch) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let reached!: () => void;
  const fetching = new Promise<void>((resolve) => (reached = resolve));
  const held: typeof fetch = async (...args) => {
    reached();
    await released;
    return answer(...args);
  };
  return { held, fetching, release };
}

/** Composed as `apps/server/src/composition/accounts.ts` does. */
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

    await h.boss.offWork(QUEUES.sync);
  }, 120_000);
});

describe("sync deliveries", () => {
  const fixture = { fetch: chessComFixtureFetch() };

  it("a delivery for a job that no longer exists resolves without work", async () => {
    // The row went with the account, so resolving lets pg-boss end the
    // delivery instead of retrying it.
    const job = await newSyncJob();
    await deleteTrackedAccountAndGames(h.db, job.accountId);

    await expect(sync(fixture, await deliver(job))).resolves.toBeUndefined();
  });

  it("a settled job delivered again does nothing", async () => {
    const job = await newSyncJob();
    const delivery = await deliver(job);
    await sync(fixture, delivery);
    expect(await jobOf(job)).toMatchObject({ status: "succeeded", gamesInserted: 2 });

    // What a consumer crashing right after its commit looks like.
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
    // No cursor for a pass that never completed, and nothing saved twice.
    expect((await getTrackedAccount(h.db, job.accountId))?.syncCursor).toBeNull();
    expect(await jobOf(job)).toMatchObject({ gamesFetched: 0, gamesInserted: 0 });
  });

  it("a cursor stored in the other provider's shape starts the walk over", async () => {
    // Cast by platform rather than parsed, a Lichess-shaped row reached
    // chess.com with `month === undefined`, matching no archive month: the
    // pass completed having fetched nothing.
    const job = await newSyncJob();
    await updateTrackedAccountCursor(h.db, job.accountId, { sinceMs: 1_704_067_200_000 });
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
    // Reported, or a full archive walk looks routine.
    expect(unreadable).toEqual([{ accountId: job.accountId, platform: "chess_com" }]);
  }, 60_000);

  it("a handle gone from the provider fails for good, keeping the account", async () => {
    const job = await newSyncJob("vanished");
    const gone = {
      fetch: async () => new Response("", { status: 404 }),
    };

    await sync(gone, await deliver(job));

    expect(await jobOf(job)).toMatchObject({ status: "failed", errorCode: "not-found" });
    expect(await getTrackedAccount(h.db, job.accountId)).not.toBeNull();
  });

  it("a delivery cancelled after its last response keeps the month it already checkpointed", async () => {
    // pg-boss aborts on expiry or a lost claim. The fetch has already
    // answered, so the slice itself stops, but the fixture's one month
    // checkpointed before the cancellation was observed and survives.
    const job = await newSyncJob();
    const deadline = new AbortController();
    const lateFetch: typeof fetch = async (input) => {
      const response = await chessComFixtureFetch()(input);
      deadline.abort(new Error("delivery expired"));
      return response;
    };

    await expect(
      sync({ fetch: lateFetch }, { ...(await deliver(job)), signal: deadline.signal }),
    ).rejects.toThrow(/expired/);

    expect(await jobOf(job)).toMatchObject({ status: "retrying", errorCode: "internal" });
    expect(await gamesWithStatus(job.userId, job.accountId)).toHaveLength(2);
    expect((await getTrackedAccount(h.db, job.accountId))?.syncCursor).not.toBeNull();
  });

  it("a delivery cancelled mid-fetch stops at the provider", async () => {
    // The provider hands pg-boss's signal to fetch, so an abort mid-request
    // rejects there, before any archive page is read.
    const job = await newSyncJob();
    const deadline = new AbortController();
    deadline.abort(new Error("delivery expired"));

    await expect(
      sync(
        { fetch: signalHonoringFetch },
        { ...(await deliver(job)), signal: deadline.signal },
      ),
    ).rejects.toThrow(/expired/);

    expect(await jobOf(job)).toMatchObject({ status: "retrying", errorCode: "internal" });
    expect(await gamesWithStatus(job.userId, job.accountId)).toEqual([]);
  });

  it("a delivery that lost the job to a retry writes nothing", async () => {
    const job = await newSyncJob();
    // The stale delivery brings a different archive, so anything of it that
    // lands is visible.
    const stale = heldFetch(chessComListingFixtureFetch());
    const current = heldFetch(chessComFixtureFetch());

    const first = sync({ fetch: stale.held }, await deliver(job));
    await stale.fetching;
    // pg-boss takes the job back, as its supervisor does on a missed
    // heartbeat, and the retry re-stamps the row.
    await h.boss.fail(QUEUES.sync, job.id, new Error("heartbeat timeout"));
    const second = sync({ fetch: current.held }, await deliver(job));
    await current.fetching;

    // The first wakes up and commits, but its stamp is gone, so every write
    // misses the row.
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
    // The dashboard's "retry" keeps the sync job's id, so the row picks up
    // where it left off once the provider answers.
    const job = await newSyncJob();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const delivery = await deliver(job);
      await expect(sync({ fetch: brokenMonth }, delivery)).rejects.toThrow(/incomplete/);
      await h.boss.fail(QUEUES.sync, delivery);
    }
    expect(await bossStateOf(job)).toMatchObject({ state: "failed" });
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
    // A redrive mints a new job id, which resolves to no sync job, so the
    // delivery completes without work.
    const job = await newSyncJob();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const delivery = await deliver(job);
      await expect(sync({ fetch: brokenMonth }, delivery)).rejects.toThrow(/incomplete/);
      await h.boss.fail(QUEUES.sync, delivery);
    }

    // The dead-letter queue holds every sync this file let die, so the
    // redriven copy is told apart by its singleton key.
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
    await syncing;

    expect(await getTrackedAccount(h.db, job.accountId)).toBeNull();
    expect(await jobOf(job)).toBeNull();
    expect((await listGamesPage(h.db, job.userId)).total).toBe(0);
  });

  it("resumes from its checkpoint: a month already synced is never re-fetched", async () => {
    const job = await newSyncJob();
    const crashing = multiMonthFetch({ failMonth: "2026/08" });

    // 06 and 07 each checkpoint, 08 fails, so the pass is incomplete with
    // its cursor past 07 rather than at the start.
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

    // 06 is never touched again; 07 is re-walked, being the boundary month
    // an archive can still append to.
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
});
