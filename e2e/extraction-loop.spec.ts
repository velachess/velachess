// @vitest-environment node
/**
 * ACCEPTANCE (cycle 6) — the extraction loop through the two apps only:
 * sync real-shaped games → derive the book FROM those games → judge
 * re-reaches them per-repertoire → the in-book blunder becomes a drilled
 * exercise. No repertoire is ever typed in by hand.
 *
 * Lives at the repo root, not under either app: it composes BOTH
 * deployables — the api answering HTTP and the worker consuming pg-boss —
 * so it belongs to neither. Under apps/server it made the server suite
 * reach into apps/worker/src, which is exactly the dependency the
 * two-deployable split exists to prevent.
 */
import { afterAll, beforeAll, expect, it } from "vitest";

import { completeAnalysis } from "@velachess/application/analysis/process-analysis/process-analysis";
import { logger } from "@velachess/logger";
import { chessComExtractFixtureFetch, poll } from "@velachess/test-utils";

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
  harness = await createApiHarness({ fetch: chessComExtractFixtureFetch() });
  owner = (await harness.signUp("owner@e2e-extract.test")).app;
  await registerConsumers(harness.boss, {
    db: harness.db,
    analyze: harness.analyze,
    analysisQueue: harness.deps.analysisQueue,
    sync: { fetch: chessComExtractFixtureFetch() },
    log: testLogger,
  });
}, 120_000);

afterAll(async () => {
  await harness.close();
});

it("extraction loop: games in, book derived, blunder inside the book drilled", async () => {
  const app = owner;

  // 1. Import — one POST creates the connection and fills the archive.
  // No repertoire exists yet, so there is nothing to judge (by design).
  const imported = await app.request(
    "/accounts",
    json({ platform: "chess_com", username: "looper" }),
  );
  expect(imported.status).toBe(201);
  const archive = (await (
    await app.request("/games?platform=chess_com&username=looper")
  ).json()) as { account: { id: string }; games: unknown[] };
  expect(archive.games).toHaveLength(3);
  const account = archive.account;

  // 2. Extract the book from the games themselves.
  const extractRes = await app.request(
    "/repertoires/extract",
    json({ color: "white", minGames: 2 }),
  );
  expect(extractRes.status).toBe(201);
  const extract = (await extractRes.json()) as {
    repertoireId: string;
    chapters: number;
    gamesConsidered: number;
  };
  expect(extract.gamesConsidered).toBe(3);
  expect(extract.chapters).toBeGreaterThanOrEqual(1);

  // Chapter named from the chess.com ECOUrl slug, book = the shared line.
  const repertoires = (await (await app.request("/repertoires")).json()) as {
    id: string;
    name: string;
  }[];
  expect(repertoires.some((r) => r.name === "White repertoire")).toBe(true);

  // 3. Judge against the derived book: the two supporters stay in book,
  // the 2.g4?? game deviates INSIDE it. Replay only — nothing queued.
  const judged = (await (
    await app.request("/games/judge", { method: "POST" })
  ).json()) as {
    judged: number;
    enqueuedForAnalysis: number;
  };
  expect(judged.judged).toBe(3);
  expect(judged.enqueuedForAnalysis).toBe(0);

  // 4. Open the deviant game — the one act that spends engine time. Its
  // severity is what makes the blunder drillable.
  const games = (await (await app.request(`/accounts/${account.id}/games`)).json()) as {
    id: string;
    judgmentType: string | null;
  }[];
  const deviant = games.find((g) => g.judgmentType === "deviation")!;
  expect(deviant).toBeDefined();

  const asked = await app.request(`/games/${deviant.id}/analyze`, { method: "POST" });
  expect(asked.status).toBe(202);

  // The worker's job, inline — the request no longer owns the run.
  await completeAnalysis(harness.db, harness.analyze, deviant.id);

  // Scoped to the deviation origin: the chapter's own line positions
  // also live in the queue now, and this loop is about the mistake.
  const nextRes = await app.request("/drill/next?source=repertoire-deviation");
  expect(nextRes.status).toBe(200);
  const item = (await nextRes.json()) as { exerciseId: string; fen: string };
  expect(item.fen).toContain(" w ");

  const answer = (await (
    await app.request("/drill/answer", json({ exerciseId: item.exerciseId, san: "d4" }))
  ).json()) as { correct: boolean; expectedSans: string[] };
  expect(answer.correct).toBe(true);
  expect(answer.expectedSans).toEqual(["d4"]);

  // 6. The read model sees the drilled loop: the deviation row is
  // marked drilled.
  const deviations = (await (await app.request("/deviations")).json()) as {
    drilled: boolean;
  }[];
  expect(deviations).toHaveLength(1);
  expect(deviations[0]!.drilled).toBe(true);
}, 120_000);
