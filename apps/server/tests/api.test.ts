// @vitest-environment node
/**
 * Route behavior over the real harness. Seeding uses application services
 * directly where the worker would normally act — the worker's own suite
 * and the e2e cover that side.
 */
import { randomUUID } from "node:crypto";

import { parseResponse } from "hono/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LOOPER_USERNAME } from "@velachess/fixtures";
import { QUEUES } from "@velachess/infra-queue";
import { chessComFixtureFetch } from "@velachess/test-utils";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;
let accountId: string;
let queuedGameId: string;

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  harness = await createApiHarness();
  // Every request below is made as this signed-in user — the suite goes
  // through the same session gate production does, never around it.
  owner = (await harness.signUp("owner@api.test")).app;
});

afterAll(async () => {
  await harness.close();
});

/** A one-month chess.com archive of `count` distinct legal games: each bit of a
 * game's index picks which knight pair makes a there-and-back trip. */
function largeArchiveFetch(count: number): typeof fetch {
  const bits = Math.ceil(Math.log2(count));
  const games = Array.from({ length: count }, (_, game) => {
    const moves = Array.from({ length: bits }, (_unused, bit) => {
      const n = 2 * bit + 1;
      return game & (1 << bit)
        ? `${n}. Nf3 Nf6 ${n + 1}. Ng1 Ng8`
        : `${n}. Nc3 Nc6 ${n + 1}. Nb1 Nb8`;
    }).join(" ");
    return {
      url: `https://www.chess.com/game/live/${game}`,
      pgn: `[Event "Live Chess"]\n[White "archivist"]\n[Black "rival"]\n[Result "1-0"]\n\n${moves} 1-0\n`,
      rules: "chess",
      end_time: 1755100000 + game,
    };
  });

  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/pub/player/archivist")) return Response.json({});
    if (url.endsWith("/archives")) {
      return Response.json({
        archives: ["https://api.chess.com/pub/player/archivist/games/2026/08"],
      });
    }
    if (url.endsWith("/2026/08")) return Response.json({ games });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

describe("api routes", () => {
  it("health and validation basics", async () => {
    expect((await owner.request("/health")).status).toBe(200);
    expect(
      (await owner.request("/accounts", json({ platform: "nope", username: "" }))).status,
    ).toBe(400);
    expect((await owner.request(`/accounts/${randomUUID()}/games`)).status).toBe(404);
  });

  it("accounts: connecting normalizes the handle and schedules its first sync", async () => {
    const account = await parseResponse(
      owner.api.accounts.$post({ json: { platform: "chess_com", username: "Looper" } }),
    );
    // The stored handle is case-folded, not whatever casing the caller sent.
    expect(account.username).toBe(LOOPER_USERNAME);
    accountId = account.id;
    if (!account.syncId) throw new Error("expected a first sync on a fresh connect");

    // Connecting schedules the first sync; the archive arrives in the background.
    const scheduled = await parseResponse(owner.api.accounts.$get());
    expect(scheduled.find((entry) => entry.id === accountId)).toMatchObject({
      syncStatus: "queued",
      activeSyncId: account.syncId,
    });
    await harness.runSync(account.syncId);

    const again = await parseResponse(
      owner.api.accounts.$post({ json: { platform: "chess_com", username: "looper" } }),
    );
    expect(again.id).toBe(accountId);

    const listed = await parseResponse(owner.api.accounts.$get());
    expect(listed.find((entry) => entry.id === accountId)).toMatchObject({
      syncStatus: "idle",
      activeSyncId: null,
      lastSyncError: null,
    });
    expect(listed.find((entry) => entry.id === accountId)!.lastSyncedAt).not.toBeNull();
  });

  it("empty state: a new user has no games", async () => {
    // A brand-new user, because the owner's world is no longer empty —
    // its first sync filled the archive.
    const nobody = (await harness.signUp("empty@api.test")).app;
    const library = await parseResponse(nobody.api.games.$get({ query: {} }));
    expect(library.games).toEqual([]);
    expect(library.total).toBe(0);
  });

  it("GET /games is the unified library — a read that never imports", async () => {
    expect((await owner.request("/games?page=0")).status).toBe(400);
    expect((await owner.request("/games?outcome=nope")).status).toBe(400);

    // The library lists every game the caller owns — synced accounts and
    // manual imports together — without needing to name either.
    const library = await parseResponse(owner.api.games.$get({ query: {} }));
    expect(library.games).toHaveLength(2);
    expect(library.total).toBe(2);
    expect(library.page).toBe(1);
    expect(library.games.every((game) => game.source === "chess_com")).toBe(true);

    queuedGameId = library.games[0]!.id;
  });

  it("refreshing right after an import is rate limited, with Retry-After", async () => {
    // The import's sync ran a moment ago. Both platforms answer 429 to
    // bursts, and a refresh button is exactly the control someone taps twice.
    const tooSoon = await owner.api.accounts[":id"].sync.$post({
      param: { id: accountId },
    });
    expect(tooSoon.status).toBe(429);
    if (tooSoon.status !== 429) throw new Error("unreachable");

    const retryAfter = Number(tooSoon.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect((await tooSoon.json()).retryAfterSeconds).toBe(retryAfter);

    expect(
      (await owner.request(`/accounts/${randomUUID()}/sync`, { method: "POST" })).status,
    ).toBe(404);
  });

  it("GET /games/:id answers exactly the documented fields, nothing the row carries", async () => {
    // The handler used to spread the whole slice result and patch two
    // timestamps onto it, so any field the read later gained would ship
    // undocumented. It parses through the response schema now, which
    // strips what the contract does not name.
    const body = (await (await owner.request(`/games/${queuedGameId}`)).json()) as Record<
      string,
      unknown
    >;

    expect(Object.keys(body).toSorted()).toEqual(
      [
        "accountId",
        "blackIdentity",
        "blackName",
        "blackRating",
        "createdAt",
        "externalId",
        "externalUrl",
        "hasClocks",
        "id",
        "movetextHash",
        "openingEco",
        "openingName",
        "openingUrl",
        "perspective",
        "playedAt",
        "rawPgn",
        "result",
        "source",
        "termination",
        "timeControlIncrementSeconds",
        "timeControlInitialSeconds",
        "timeControlRaw",
        "userId",
        "whiteIdentity",
        "whiteName",
        "whiteRating",
      ].toSorted(),
    );
  });

  it("GET /games/:id returns the full game with rawPgn for board replay", async () => {
    const game = await parseResponse(
      owner.api.games[":id"].$get({ param: { id: queuedGameId } }),
    );
    expect(game.id).toBe(queuedGameId);
    expect(game.rawPgn).toContain("1. e4");
    expect((await owner.request(`/games/${randomUUID()}`)).status).toBe(404);
  });

  it("accounts: the first connection that sticks ends onboarding, once", async () => {
    // Read back through the session, which is exactly how the app learns
    // it: a stamp nobody can see is a stamp that does nothing.
    const fresh = (await harness.signUp("onboarding@api.test")).app;
    const session = async () =>
      (await (await fresh.request("/auth/get-session")).json()) as {
        user: { onboardedAt: string | null };
      };

    expect((await session()).user.onboardedAt).toBeNull();

    await fresh.request("/accounts", json({ platform: "chess_com", username: "Looper" }));
    const stamped = (await session()).user.onboardedAt;
    expect(stamped).not.toBeNull();

    // Reconnecting the same handle must not move it: it records when they
    // arrived, not when they last connected.
    await fresh.request("/accounts", json({ platform: "chess_com", username: "looper" }));
    expect((await session()).user.onboardedAt).toBe(stamped);
  });

  it("accounts: one per provider — a different handle on a connected platform is refused with 409", async () => {
    // Its own user: the suite's shared `owner` already has a chess_com
    // connection from the very first test, and this must not disturb it.
    const solo = (await harness.signUp("one-provider@api.test")).app;

    const first = await parseResponse(
      solo.api.accounts.$post({ json: { platform: "chess_com", username: "Looper" } }),
    );

    const conflict = await solo.api.accounts.$post({
      json: { platform: "chess_com", username: "someone_else" },
    });
    expect(conflict.status).toBe(409);
    if (conflict.status !== 409) throw new Error("unreachable");
    expect(await conflict.json()).toMatchObject({
      platform: "chess_com",
      username: first.username,
      accountId: first.id,
    });

    // The existing connection answers the same, untouched.
    const listed = await parseResponse(solo.api.accounts.$get());
    expect(listed.map((a) => a.id)).toEqual([first.id]);

    // The exact same handle, differently cased, stays a plain idempotent
    // re-import — not a conflict.
    const again = await parseResponse(
      solo.api.accounts.$post({ json: { platform: "chess_com", username: "LOOPER" } }),
    );
    expect(again.id).toBe(first.id);
  });

  it("accounts: delete frees the provider slot and takes the account's games with it", async () => {
    const solo = (await harness.signUp("disconnect@api.test")).app;
    const other = (await harness.signUp("not-the-owner@api.test")).app;

    const account = await parseResponse(
      solo.api.accounts.$post({ json: { platform: "chess_com", username: "Looper" } }),
    );
    if (!account.syncId) throw new Error("expected a first sync on a fresh connect");
    await harness.runSync(account.syncId);
    const gamesBefore = await parseResponse(solo.api.games.$get({ query: {} }));
    expect(gamesBefore.total).toBeGreaterThan(0);

    // Not this caller's account: 404, same as a missing id.
    expect(
      (await other.api.accounts[":id"].$delete({ param: { id: account.id } })).status,
    ).toBe(404);

    expect(
      (await solo.api.accounts[":id"].$delete({ param: { id: account.id } })).status,
    ).toBe(204);
    expect(await (await solo.request("/accounts")).json()).toEqual([]);

    // The games it imported go with it — the library no longer shows a
    // disconnected account's archive.
    const gamesAfter = await parseResponse(solo.api.games.$get({ query: {} }));
    expect(gamesAfter.total).toBe(0);

    // Deleting again is the same not-found, not an error.
    expect(
      (await solo.request(`/accounts/${account.id}`, { method: "DELETE" })).status,
    ).toBe(404);

    // The slot is free: reconnecting, even under a different handle,
    // succeeds again.
    const reconnected = await solo.request(
      "/accounts",
      json({ platform: "chess_com", username: "a_new_handle" }),
    );
    expect(reconnected.status).toBe(201);
  });
});

describe("large archives", () => {
  // ~22 bind parameters per game: 3,000 games in one INSERT pass Postgres's 65,535 cap.
  it("connecting a chess.com account with 3,000 games in one month saves them all", async () => {
    const large = await createApiHarness({ fetch: largeArchiveFetch(3_000) });
    try {
      const { app } = await large.signUp("large-archive@api.test");

      const account = await connected(app, "archivist");
      await large.runSync(account.syncId);

      const library = await parseResponse(app.api.games.$get({ query: {} }));
      expect(library.total).toBe(3_000);
    } finally {
      await large.close();
    }
  });
});

async function connected(app: AuthedApp, username: string) {
  const account = await parseResponse(
    app.api.accounts.$post({ json: { platform: "chess_com", username } }),
  );
  if (!account.syncId) throw new Error("expected a first sync on a fresh connect");
  return { ...account, syncId: account.syncId };
}

/** A fetch that answers only once `release` is called — a delivery held
 * mid-fetch, the same shape `apps/worker/tests/worker.test.ts` uses. */
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

describe("sync jobs", () => {
  it("a sync request answers 202 with a job; a repeat shares the active one", async () => {
    const { app } = await harness.signUp("sync-202@api.test");
    const account = await connected(app, LOOPER_USERNAME);

    // The connect job is still queued: requesting again returns it, before
    // any cooldown is considered — and nothing was fetched on the way.
    const [first, second] = await Promise.all([
      app.api.accounts[":id"].sync.$post({ param: { id: account.id } }),
      app.api.accounts[":id"].sync.$post({ param: { id: account.id } }),
    ]);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await first.json()).toEqual({ syncId: account.syncId, status: "queued" });
    expect(await second.json()).toEqual({ syncId: account.syncId, status: "queued" });
  });

  it("POST /accounts/sync starts every account that needs it, idempotently", async () => {
    const { app } = await harness.signUp("sync-all-active@api.test");
    const account = await connected(app, LOOPER_USERNAME);

    // The connect job is still queued: the aggregate route hands back the
    // very same job, not a new one — one account, one id, not two.
    const response = await app.api.accounts.sync.$post();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ syncIds: [account.syncId] });
  });

  it("POST /accounts/sync folds a cooling-down account out, answering an empty list", async () => {
    const { app } = await harness.signUp("sync-all-cooldown@api.test");
    const account = await connected(app, LOOPER_USERNAME);
    await harness.runSync(account.syncId);

    // Settled a moment ago: within the cooldown, so there is nothing new
    // to watch — and nothing to tell apart from having no accounts at all.
    const response = await app.api.accounts.sync.$post();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ syncIds: [] });
  });

  it("POST /accounts/sync with no tracked accounts answers an empty list", async () => {
    const { app } = await harness.signUp("sync-all-empty@api.test");

    const response = await app.api.accounts.sync.$post();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ syncIds: [] });
  });

  it("disconnecting mid-sync waits for it instead of deadlocking, and leaves no orphan games", async () => {
    // Only the connect job's own delivery (below) is held; the connect
    // step's own handle confirmation is a separate call and still answers
    // immediately.
    const { app } = await harness.signUp("disconnect-mid-sync@api.test");
    const account = await connected(app, LOOPER_USERNAME);

    const held = heldFetch(chessComFixtureFetch());
    const syncing = harness.runSync(account.syncId, held.held);
    await held.fetching;

    // The job is genuinely running (not just queued) by the time this
    // lands — markSyncRunning stamps it before the fetch call.
    const deleted = await app.api.accounts[":id"].$delete({
      param: { id: account.id },
    });
    expect(deleted.status).toBe(204);

    held.release();
    // Resolves rather than deadlocking: the held delivery finishes
    // against a row that's already gone, as a no-op.
    await syncing;

    expect(
      (await app.api.accounts[":id"].games.$get({ param: { id: account.id } })).status,
    ).toBe(404);
    // The first sync's games went with the account too — not even an
    // orphan with its account nulled.
    const library = await parseResponse(app.api.games.$get({ query: {} }));
    expect(library.total).toBe(0);
  });

  it("GET /syncs/:id follows the job to its outcome, for its owner only", async () => {
    const { app } = await harness.signUp("sync-status@api.test");
    const stranger = (await harness.signUp("sync-stranger@api.test")).app;
    const account = await connected(app, LOOPER_USERNAME);

    const queued = await parseResponse(
      app.api.syncs[":id"].$get({ param: { id: account.syncId } }),
    );
    expect(queued).toMatchObject({
      id: account.syncId,
      status: "queued",
      error: null,
      progress: {
        unitsDone: null,
        unitsTotal: null,
        gamesFetched: null,
        gamesInserted: null,
      },
    });

    await harness.runSync(account.syncId);
    const done = await parseResponse(
      app.api.syncs[":id"].$get({ param: { id: account.syncId } }),
    );
    expect(done).toMatchObject({
      status: "succeeded",
      progress: { gamesFetched: 2, gamesInserted: 2 },
    });

    expect(
      (await stranger.api.syncs[":id"].$get({ param: { id: account.syncId } })).status,
    ).toBe(404);
    expect(
      (await app.api.syncs[":id"].$get({ param: { id: randomUUID() } })).status,
    ).toBe(404);
  });

  it("a job whose delivery pg-boss already ended is closed and replaced", async () => {
    const { app } = await harness.signUp("sync-stale@api.test");
    const account = await connected(app, LOOPER_USERNAME);
    // The delivery ends without the worker recording it — as when the last
    // attempt times out.
    await harness.boss.cancel(QUEUES.sync, account.syncId);

    const replaced = await parseResponse(
      app.api.accounts[":id"].sync.$post({ param: { id: account.id } }),
    );
    expect(replaced.syncId).not.toBe(account.syncId);

    const stale = await parseResponse(
      app.api.syncs[":id"].$get({ param: { id: account.syncId } }),
    );
    expect(stale).toMatchObject({
      status: "failed",
      error: { code: "internal", retryable: true },
    });
  });

  it("a job whose delivery pg-boss already ended reads as failed, not active forever", async () => {
    const { app } = await harness.signUp("sync-dead-read@api.test");
    const account = await connected(app, LOOPER_USERNAME);
    await harness.boss.cancel(QUEUES.sync, account.syncId);

    const job = await parseResponse(
      app.api.syncs[":id"].$get({ param: { id: account.syncId } }),
    );

    expect(job).toMatchObject({
      status: "failed",
      error: { code: "internal", retryable: true },
    });
    const [listed] = await parseResponse(app.api.accounts.$get());
    expect(listed?.syncStatus).toBe("idle");
  });
});

describe("connecting a handle", () => {
  // Profiles answer per handle: one exists, one does not, one provider hiccups.
  const providerFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/pub/player/ghost")) return new Response("", { status: 404 });
    if (url.endsWith("/pub/player/flaky")) return new Response("", { status: 502 });
    return chessComFixtureFetch()(input);
  }) as typeof fetch;

  it("answers 404 for a handle the provider lacks and 503 when it cannot tell, creating nothing", async () => {
    const provider = await createApiHarness({ fetch: providerFetch });
    try {
      const { app } = await provider.signUp("connect-refusals@api.test");

      const ghost = await app.request(
        "/accounts",
        json({ platform: "chess_com", username: "ghost" }),
      );
      expect(ghost.status).toBe(404);

      const flaky = await app.request(
        "/accounts",
        json({ platform: "chess_com", username: "flaky" }),
      );
      expect(flaky.status).toBe(503);

      expect(await (await app.request("/accounts")).json()).toEqual([]);
    } finally {
      await provider.close();
    }
  });

  it("leaves no account when its first sync cannot be queued", async () => {
    const broken = await createApiHarness();
    try {
      const { app } = await broken.signUp("connect-no-queue@api.test");
      // The queue refuses every send: the account must not commit without it.
      await broken.pglite.exec("drop schema pgboss cascade");

      const response = await app.request(
        "/accounts",
        json({ platform: "chess_com", username: LOOPER_USERNAME }),
      );
      expect(response.status).toBe(500);
      expect(await (await app.request("/accounts")).json()).toEqual([]);
    } finally {
      await broken.close();
    }
  });
});
