// @vitest-environment node
/**
 * ACCEPTANCE — the whole loop through the two apps only: every user action
 * is an HTTP request against the api; every background step is a pg-boss
 * delivery consumed by the worker. No direct domain-package calls.
 *
 * import → refresh (refused) → open a game → engine analysis → review,
 * over PGlite + real migrations + real Stockfish.
 *
 * Every user action here is one HTTP request that answers for itself —
 * the worker's own suite owns background delivery.
 *
 * The engine appears exactly once, where a person asked for it: opening a
 * game. Importing and refreshing never reach it.
 *
 * Lives at the repo root, not under either app: it composes BOTH
 * deployables — the api answering HTTP and the worker consuming pg-boss —
 * so it belongs to neither. Under apps/server it made the server suite
 * reach into apps/worker/src, which is exactly the dependency the
 * two-deployable split exists to prevent.
 */
import { afterAll, beforeAll, expect, it } from "vitest";

import { completeAnalysis } from "@velachess/analysis";
import { logger } from "@velachess/infra-logger";
import { chessComFixtureFetch, poll } from "@velachess/test-utils";

import { registerConsumers } from "../apps/worker/src/worker.ts";
import {
  createApiHarness,
  type ApiHarness,
  type AuthedApp,
} from "../apps/server/tests/harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;
const testLogger = logger.child({ component: "test-worker" }, { level: "silent" });

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  harness = await createApiHarness();
  owner = (await harness.signUp("owner@e2e.test")).app;
  // The worker rides the same boss/db — exactly the deployment shape
  // (api + worker containers, one Postgres — docker/docker-compose.yml).
  await registerConsumers(harness.boss, {
    db: harness.db,
    analyze: harness.analyze,
    sync: { fetch: chessComFixtureFetch() },
    log: testLogger,
  });
}, 120_000);

afterAll(async () => {
  await harness.close();
});

it("full loop: HTTP in, worker in the background, a reviewed game out", async () => {
  const app = owner;

  // 1. Import: one POST — reads no longer create connections. The
  //    archive lands synchronously, engine untouched.
  const imported = await app.request(
    "/accounts",
    json({ platform: "chess_com", username: "looper" }),
  );
  expect(imported.status).toBe(201);
  const account = (await imported.json()) as { id: string };
  const library = (await (await app.request("/games")).json()) as {
    total: number;
    games: { id: string; analyzed: boolean }[];
  };
  expect(library.games).toHaveLength(2);
  expect(library.total).toBe(2);
  expect(library.games.every((g) => !g.analyzed)).toBe(true);

  // 2. Refreshing now is refused: the import synced a moment ago, and the
  //    platforms answer 429 to bursts.
  const tooSoon = await app.request(`/accounts/${account.id}/sync`, {
    method: "POST",
  });
  expect(tooSoon.status).toBe(429);
  expect(Number(tooSoon.headers.get("Retry-After"))).toBeGreaterThan(0);

  const games = (await (await app.request(`/accounts/${account.id}/games`)).json()) as {
    id: string;
    analyzed: boolean;
  }[];
  const game = games[0]!;
  expect(games.every((g) => !g.analyzed)).toBe(true);

  // 3. Open a game. THIS is what asks for Stockfish — one game,
  //    because someone wanted to see it. The request only enqueues; the
  //    worker below is what runs it.
  const asked = await app.request(`/games/${game.id}/analyze`, { method: "POST" });
  expect(asked.status).toBe(202);

  await completeAnalysis(harness.analyze, game.id);

  const watched = await app.request(`/games/${game.id}/analysis/events`);
  expect(await watched.text()).toContain("event: analysis.completed");

  const analyzed = (await (await app.request(`/games/${game.id}/analysis`)).json()) as {
    status: string;
  };
  expect(analyzed.status).toBe("completed");

  const listed = (await (await app.request("/games")).json()) as {
    games: { id: string; analyzed: boolean }[];
  };
  expect(listed.games.find((g) => g.id === game.id)?.analyzed).toBe(true);
}, 120_000);
