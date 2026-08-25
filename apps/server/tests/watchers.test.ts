// @vitest-environment node
/**
 * The fan-out, which exists for one number: how many poll loops run when
 * several people watch the same analysis.
 *
 * These read the registry's size rather than the page, and that is the
 * point — sharing a loop has no appearance. A per-connection loop and a
 * shared one produce identical streams and a tenfold difference in load,
 * so the only way to hold the difference is to count.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { appendProgress } from "@velachess/db";

import { createWatchers } from "@velachess/application/analysis/watch-analysis/watchers";
import { createApiHarness, type ApiHarness } from "./harness.ts";

let harness: ApiHarness;
let gameId: string;

beforeAll(async () => {
  harness = await createApiHarness();
  // Reads no longer import; the connection is created explicitly first.
  const owner = (await harness.signUp("owner@watchers.test")).app;
  await owner.request("/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform: "chess_com", username: "looper" }),
  });
  const games = (await (
    await owner.request("/games?platform=chess_com&username=looper")
  ).json()) as { games: { id: string }[] };
  gameId = games.games[0]!.id;
});

afterAll(() => harness.close());

const aPosition = (ply: number) => ({
  ply,
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  san: "e4",
  evalBefore: { cp: 0 },
  evalAfter: { cp: 20 },
  bestMove: "e2e4",
  category: "best" as const,
  winChanceLoss: 0,
});

describe("shared watchers", () => {
  it("runs one loop for a game however many are watching it", async () => {
    const watchers = createWatchers({
      db: harness.db,
      analysisQueue: harness.analysisQueue,
      intervalMs: 20,
    });
    const controllers = [
      new AbortController(),
      new AbortController(),
      new AbortController(),
    ];

    // Three connections, opened the way three browsers would.
    const readers = controllers.map(async (controller) => {
      for await (const snapshot of watchers.watch(gameId, controller.signal)) {
        void snapshot;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(watchers.size()).toBe(1);

    // And it stops when the last of them leaves — a loop nobody reads is
    // the cost this file exists to avoid.
    for (const controller of controllers) controller.abort();
    await Promise.all(readers);
    expect(watchers.size()).toBe(0);

    watchers.close();
  });

  it("hands a late subscriber everything already known", async () => {
    // Someone opening the screen halfway through a run must not wait for
    // the next poll to see what has been graded — the shared loop's
    // snapshot is the answer, and it is handed over on subscribe.
    const watchers = createWatchers({
      db: harness.db,
      analysisQueue: harness.analysisQueue,
      intervalMs: 20,
    });
    await appendProgress(harness.db, {
      runId: crypto.randomUUID(),
      gameId,
      index: 0,
      total: 5,
      position: aPosition(1),
    });

    // The first watcher stays attached: it leaving would stop the loop,
    // which is exactly the behaviour the test above pins.
    const early = new AbortController();
    let known = 0;
    const first = (async () => {
      for await (const snapshot of watchers.watch(gameId, early.signal)) {
        known = snapshot.rows.length;
      }
    })();
    await vi.waitFor(() => expect(known).toBe(1));

    const late = new AbortController();
    const seen = await watchers.watch(gameId, late.signal)[Symbol.asyncIterator]().next();

    expect(seen.value?.rows).toHaveLength(1);

    early.abort();
    late.abort();
    await first;
    watchers.close();
  });
});
