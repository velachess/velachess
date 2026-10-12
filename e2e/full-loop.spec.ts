// @vitest-environment node
/**
 * ACCEPTANCE — the whole loop through the two apps only: every user action
 * is an HTTP request against the api; every background step is a pg-boss
 * delivery consumed by the worker. No direct domain-package calls.
 *
 * import → background sync → refresh (refused) → open a game → engine
 * analysis → review, over PGlite + real migrations + real Stockfish.
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
import { parseResponse } from "hono/client";
import { afterAll, beforeAll, expect, it } from "vitest";

import { completeAnalysis } from "@velachess/analysis";
import { logger } from "@velachess/infra-logger";
import { chessComFixtureFetch, poll } from "@velachess/test-utils";

import { Worker } from "../apps/worker/src/worker.ts";
import {
  createApiHarness,
  type ApiHarness,
  type AuthedApp,
} from "../apps/server/tests/harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;
const testLogger = logger.child({ component: "test-worker" }, { level: "silent" });

beforeAll(async () => {
  harness = await createApiHarness();
  owner = (await harness.signUp("owner@e2e.test")).app;
  // The worker rides the same boss/db — exactly the deployment shape
  // (api + worker containers, one Postgres — docker/docker-compose.yml).
  await new Worker({
    boss: harness.boss,
    db: harness.db,
    analyze: harness.analyze,
    sync: { fetch: chessComFixtureFetch() },
    log: testLogger,
  }).start();
}, 120_000);

afterAll(async () => {
  await harness.close();
});

it("full loop: HTTP in, worker in the background, a reviewed game out", async () => {
  const app = owner;

  // 1. Import: one POST schedules the first sync; the worker fetches the
  //    archive in the background, engine untouched.
  const account = await parseResponse(
    app.api.accounts.$post({ json: { platform: "chess_com", username: "looper" } }),
  );
  const { syncId } = account;
  if (!syncId) throw new Error("expected a first sync on a fresh connect");
  const synced = await poll(async () => {
    const job = await parseResponse(app.api.syncs[":id"].$get({ param: { id: syncId } }));
    return job.status === "succeeded" ? job : null;
  }, 60_000);
  expect(synced.progress.gamesInserted).toBe(2);

  const library = await parseResponse(app.api.games.$get({ query: {} }));
  expect(library.games).toHaveLength(2);
  expect(library.total).toBe(2);
  expect(library.games.every((g) => !g.analyzed)).toBe(true);

  // 2. Refreshing now is refused: the import's sync started a moment ago,
  //    and the platforms answer 429 to bursts.
  const tooSoon = await app.api.accounts[":id"].sync.$post({
    param: { id: account.id },
  });
  expect(tooSoon.status).toBe(429);
  expect(Number(tooSoon.headers.get("Retry-After"))).toBeGreaterThan(0);

  const games = await parseResponse(
    app.api.accounts[":id"].games.$get({ param: { id: account.id } }),
  );
  const game = games[0]!;
  expect(games.every((g) => !g.analyzed)).toBe(true);

  // 3. Open a game. THIS is what asks for Stockfish — one game,
  //    because someone wanted to see it. The request only enqueues; the
  //    worker below is what runs it.
  const asked = await app.api.games[":id"].analyze.$post({ param: { id: game.id } });
  expect(asked.status).toBe(202);

  await completeAnalysis(harness.analyze, game.id);

  const watched = await app.request(`/games/${game.id}/analysis/events`);
  expect(await watched.text()).toContain("event: analysis.completed");

  const analyzed = await parseResponse(
    app.api.games[":id"].analysis.$get({ param: { id: game.id } }),
  );
  expect(analyzed.status).toBe("completed");

  const listed = await parseResponse(app.api.games.$get({ query: {} }));
  expect(listed.games.find((g) => g.id === game.id)?.analyzed).toBe(true);
}, 120_000);
