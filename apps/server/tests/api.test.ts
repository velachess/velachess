// @vitest-environment node
/**
 * Route behavior over the real harness. Seeding uses application services
 * directly where the worker would normally act — the worker's own suite
 * and the e2e cover that side.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { completeAnalysis } from "@velachess/analysis";
import { appendProgress } from "@velachess/infra-db";
import { LOOPER_USERNAME } from "@velachess/fixtures";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;
let accountId: string;
let queuedGameId: string;
let reviewedGameId: string;

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

/** The first chunks of a stream that is still open, as text. */
async function readSome(response: Response, ms = 1500) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + ms;
  let text = "";
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 300),
      ),
    ]);
    if (next.done) break;
    text += decoder.decode(next.value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

const aStubPosition = (ply: number) => ({
  ply,
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  san: "e4",
  evalBefore: { cp: 0 },
  evalAfter: { cp: 20 },
  bestMove: "e2e4",
  category: "best" as const,
  winChanceLoss: 0,
});

describe("api routes", () => {
  it("health and validation basics", async () => {
    expect((await owner.request("/health")).status).toBe(200);
    expect(
      (await owner.request("/accounts", json({ platform: "nope", username: "" }))).status,
    ).toBe(400);
    expect((await owner.request(`/accounts/${randomUUID()}/games`)).status).toBe(404);
  });

  it("accounts: create is an upsert", async () => {
    const created = await owner.request(
      "/accounts",
      json({ platform: "chess_com", username: "Looper" }),
    );
    expect(created.status).toBe(201);
    const account = (await created.json()) as { id: string; username: string };
    expect(account.username).toBe(LOOPER_USERNAME); // normalized
    accountId = account.id;

    const again = await owner.request(
      "/accounts",
      json({ platform: "chess_com", username: "looper" }),
    );
    expect(((await again.json()) as { id: string }).id).toBe(accountId);

    const listed = (await (await owner.request("/accounts")).json()) as {
      id: string;
      lastSyncedAt: string | null;
    }[];
    // Importing IS the first sync now — first contact fills the archive,
    // so a listed account never shows the old "connected, never synced"
    // limbo for a username the platform knows.
    expect(listed.find((entry) => entry.id === accountId)!.lastSyncedAt).not.toBeNull();
  });

  it("empty state: a new user has no games", async () => {
    // A brand-new user, because the owner's world is no longer empty —
    // importing fills the archive at POST /accounts.
    const nobody = (await harness.signUp("empty@api.test")).app;
    const library = (await (await nobody.request("/games")).json()) as {
      games: unknown[];
      total: number;
    };
    expect(library.games).toEqual([]);
    expect(library.total).toBe(0);
  });

  it("GET /games is the unified library — a read that never imports nor starts an engine", async () => {
    expect((await owner.request("/games?page=0")).status).toBe(400);
    expect((await owner.request("/games?outcome=nope")).status).toBe(400);

    // The library lists every game the caller owns — synced accounts and
    // manual imports together — without needing to name either.
    const response = await owner.request("/games");
    expect(response.status).toBe(200);

    const library = (await response.json()) as {
      games: { id: string; source: string; analyzed: boolean }[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(library.games).toHaveLength(2);
    expect(library.total).toBe(2);
    expect(library.page).toBe(1);
    expect(library.games.every((game) => game.source === "chess_com")).toBe(true);

    // Reading the library never reaches Stockfish. That is what opening
    // one game is for — importing hundreds must not queue hundreds of runs.
    for (const game of library.games) {
      expect(game.analyzed).toBe(false);
      expect(await harness.deps.analysisQueue.getState(game.id)).toBe("none");
    }
  });

  it("refreshing right after an import is rate limited, with Retry-After", async () => {
    // The import synced a moment ago. Both platforms answer 429 to bursts,
    // and a refresh button is exactly the control someone taps twice.
    const tooSoon = await owner.request(`/accounts/${accountId}/sync`, {
      method: "POST",
    });
    expect(tooSoon.status).toBe(429);

    const retryAfter = Number(tooSoon.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(
      ((await tooSoon.json()) as { retryAfterSeconds: number }).retryAfterSeconds,
    ).toBe(retryAfter);

    expect(
      (await owner.request(`/accounts/${randomUUID()}/sync`, { method: "POST" })).status,
    ).toBe(404);
  });

  it("the account's games carry no analysis until someone asks", async () => {
    const games = (await (
      await owner.request(`/accounts/${accountId}/games`)
    ).json()) as { id: string; analyzed: boolean }[];
    expect(games).toHaveLength(2);
    expect(games.every((game) => !game.analyzed)).toBe(true);
    queuedGameId = games[0]!.id;
    reviewedGameId = games[1]!.id;

    expect(await harness.deps.analysisQueue.getState(queuedGameId)).toBe("none");
  });

  it("analyze state mapping: queued → 202, unknown → 404", async () => {
    // A background enqueue is still possible (a redrive, a future batch);
    // an interactive POST must not start a second run on top of it.
    await harness.deps.analysisQueue.enqueue(harness.db, queuedGameId);

    const queued = await owner.request(`/games/${queuedGameId}/analyze`, {
      method: "POST",
    });
    expect(queued.status).toBe(202);
    expect(((await queued.json()) as { status: string }).status).toBe("queued");

    expect(
      (await owner.request(`/games/${randomUUID()}/analyze`, { method: "POST" })).status,
    ).toBe(404);
  });

  it("analyze enqueues and returns rather than holding the run open", async () => {
    const res = await owner.request(`/games/${reviewedGameId}/analyze`, {
      method: "POST",
    });

    expect(res.status).toBe(202);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(((await res.json()) as { status: string }).status).toBe("queued");
  });

  it("does not carry a dead run's cursor into the run that replaced it", async () => {
    // pg-boss retries. A client holding `Last-Event-ID` from the attempt
    // that died asks to resume past an index the new attempt has not
    // reached — and a plain numeric cursor would skip everything the
    // replacement graded. The id has to say which run it belongs to.
    const crashed = randomUUID();
    for (const index of [0, 1, 2, 3, 4, 5]) {
      await appendProgress(harness.db, {
        runId: crashed,
        gameId: queuedGameId,
        index,
        total: 20,
        position: aStubPosition(index + 1),
      });
    }

    // The replacement has graded three moves, numbered from zero again.
    const live = randomUUID();
    for (const index of [0, 1, 2]) {
      await appendProgress(harness.db, {
        runId: live,
        gameId: queuedGameId,
        index,
        total: 20,
        position: aStubPosition(index + 1),
      });
    }

    const events = await owner.request(`/games/${queuedGameId}/analysis/events`, {
      headers: { "Last-Event-ID": `${crashed}:5` },
    });
    // Read what arrives rather than awaiting the whole body: the run has
    // not finished, so the route correctly holds the connection open and
    // `text()` would wait out the deadline.
    const transcript = await readSome(events);

    // Everything the live run has graded, not nothing.
    expect(transcript).toContain(`id: ${live}:0`);
    expect(transcript).toContain(`id: ${live}:2`);
    expect(transcript).not.toContain(`id: ${crashed}`);
  });

  it("the watch route replays a run's progress and closes on the report", async () => {
    // Progress is staged rather than raced for. The route is a view over
    // durable state and nothing else, so what it must be held to is what
    // it does with rows that exist — not whether a real engine happens to
    // still be mid-game when the connection opens.
    const runId = randomUUID();
    await appendProgress(harness.db, {
      runId,
      gameId: reviewedGameId,
      index: 0,
      total: 2,
      position: {
        ply: 1,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        san: "e4",
        evalBefore: { cp: 0 },
        evalAfter: { cp: 20 },
        bestMove: "e2e4",
        category: "best",
        winChanceLoss: 0,
      },
    });

    // Headers arrive before the body: the watcher is already polling while
    // the worker works, which is the point of it not owning the run.
    const events = await owner.request(`/games/${reviewedGameId}/analysis/events`);
    expect(events.headers.get("content-type")).toContain("text/event-stream");

    // The worker, inline. Delivery is pg-boss's business and lives in
    // apps/worker; what this pins is that the run is not the request.
    const run = completeAnalysis(harness.analyze, reviewedGameId);
    const transcript = await events.text(); // resolves when the route closes
    await run;

    expect(transcript).toContain("event: analysis.move-graded");
    expect(transcript).toContain("event: analysis.completed");
    expect(transcript).not.toContain("event: analysis.failed");
  });

  it("completed analysis short-circuits: POST returns the cache, GET reads it", async () => {
    const post = await owner.request(`/games/${reviewedGameId}/analyze`, {
      method: "POST",
    });
    expect(post.status).toBe(200);
    const body = (await post.json()) as {
      status: string;
      analysis: { positions: unknown[] };
    };
    expect(body.status).toBe("completed");
    expect(body.analysis.positions.length).toBeGreaterThan(0);

    const get = await owner.request(`/games/${reviewedGameId}/analysis`);
    expect(((await get.json()) as { status: string }).status).toBe("completed");

    const games = (await (
      await owner.request(`/accounts/${accountId}/games`)
    ).json()) as {
      id: string;
      analyzed: boolean;
    }[];
    expect(games.find((g) => g.id === reviewedGameId)?.analyzed).toBe(true);
  });

  it("GET /games/:id returns the full game with rawPgn for board replay", async () => {
    const game = (await (await owner.request(`/games/${queuedGameId}`)).json()) as {
      id: string;
      rawPgn: string;
    };
    expect(game.id).toBe(queuedGameId);
    expect(game.rawPgn).toContain("1. e4");
    expect((await owner.request(`/games/${randomUUID()}`)).status).toBe(404);
  });
});
