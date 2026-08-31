// @vitest-environment node
/**
 * ACCEPTANCE — the whole loop through the two apps only: every user action
 * is an HTTP request against the api; every background step is a pg-boss
 * delivery consumed by the worker. No direct domain-package calls.
 *
 * import → refresh (refused) → judge → open a game → engine analysis →
 * drills → review, over PGlite + real migrations + real Stockfish.
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
import { LOOPER_REPERTOIRE_PGN } from "@velachess/fixtures";
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
    analysisQueue: harness.deps.analysisQueue,
    sync: { fetch: chessComFixtureFetch() },
    log: testLogger,
  });
}, 120_000);

afterAll(async () => {
  await harness.close();
});

it("full loop: HTTP in, worker in the background, a drilled exercise out", async () => {
  const app = owner;

  // 1. Repertoire via HTTP
  const repertoire = (await (
    await app.request("/repertoires", json({ name: "White e4", color: "white" }))
  ).json()) as { id: string };
  await app.request(
    `/repertoires/${repertoire.id}/chapters`,
    json({ name: "French", pgn: LOOPER_REPERTOIRE_PGN }),
  );

  // 2. Import: one POST — reads no longer create connections. The
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

  // 3. Refreshing now is refused: the import synced a moment ago, and the
  //    platforms answer 429 to bursts.
  const tooSoon = await app.request(`/accounts/${account.id}/sync`, {
    method: "POST",
  });
  expect(tooSoon.status).toBe(429);
  expect(Number(tooSoon.headers.get("Retry-After"))).toBeGreaterThan(0);

  // 4. Judge against the book — replay, no engine.
  const judged = (await (
    await app.request("/games/judge", { method: "POST" })
  ).json()) as {
    judged: number;
    enqueuedForAnalysis: number;
  };
  expect(judged).toMatchObject({ judged: 2, enqueuedForAnalysis: 0 });

  const games = (await (await app.request(`/accounts/${account.id}/games`)).json()) as {
    id: string;
    judgmentType: string | null;
    analyzed: boolean;
  }[];
  const deviant = games.find((g) => g.judgmentType === "deviation")!;
  expect(deviant).toBeDefined();
  expect(games.every((g) => !g.analyzed)).toBe(true);

  // 5. Open the deviant game. THIS is what asks for Stockfish — one game,
  //    because someone wanted to see it. The request only enqueues; the
  //    worker below is what runs it.
  const asked = await app.request(`/games/${deviant.id}/analyze`, { method: "POST" });
  expect(asked.status).toBe(202);

  await completeAnalysis(harness.analyze, deviant.id);

  const watched = await app.request(`/games/${deviant.id}/analysis/events`);
  expect(await watched.text()).toContain("event: analysis.completed");

  const analyzed = (await (
    await app.request(`/games/${deviant.id}/analysis`)
  ).json()) as {
    status: string;
  };
  expect(analyzed.status).toBe("completed");

  // 7. Drill it: get the item, answer with the repertoire move
  // Scoped to the deviation origin: the chapter's own line positions
  // also live in the queue now, and this loop is about the mistake.
  const nextRes = await app.request("/drill/next?source=repertoire-deviation");
  expect(nextRes.status).toBe(200);
  const item = (await nextRes.json()) as {
    exerciseId: string;
    fen: string;
    phase: string;
  };
  expect(item.phase).toBe("new");
  expect(item.fen).toContain(" w "); // playable position, white to move

  const answer = (await (
    await app.request("/drill/answer", json({ exerciseId: item.exerciseId, san: "d4" }))
  ).json()) as { correct: boolean; expectedSans: string[]; nextDue: string };
  expect(answer.correct).toBe(true);
  expect(answer.expectedSans).toEqual(["d4"]);
  expect(new Date(answer.nextDue).getTime()).toBeGreaterThan(Date.now());

  // 8. The loop shows up in the numbers
  const overview = (await (await app.request("/overview")).json()) as Record<
    string,
    number
  >;
  expect(overview["games"]).toBe(2);
  // Three exercises, all of them the chapter's own decision positions
  // (start, after 1...e6, after 2...d5), seeded as repertoire-line the
  // moment the chapter landed. Both mistake origins fired too — and
  // added no fourth row: the deviation happened AT the "after 1...e6"
  // decision (2.g4 instead of the prepared d4), so identity by
  // (user, position) collapses line, deviation and engine blunder into
  // one exercise with three provenances. That collapse is the whole
  // reason identity is the position and not the origin.
  expect(overview["exercises"]).toBe(3);

  // The report carries the CTA's count, and it agrees with what triage
  // actually seeded. These are two different code paths reading the same
  // game; a number beside a button that serves a different number is the
  // failure this asserts against.
  const report = (await (await app.request(`/games/${deviant.id}/analysis`)).json()) as {
    drills: { eligible: number; seeded: number; triaged: boolean };
  };
  expect(report.drills.triaged).toBe(true);
  expect(report.drills.eligible).toBeGreaterThanOrEqual(1);
  expect(report.drills.seeded).toBe(report.drills.eligible);
}, 120_000);
