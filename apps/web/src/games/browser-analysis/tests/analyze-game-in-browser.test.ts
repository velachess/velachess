import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fensToEvaluate, POLICY_VERSION } from "@velachess/analysis";
import { parsePgn, replayMainline } from "@velachess/chess";
import { EngineSession, type Transport } from "@velachess/infra-engine";

import { aGradedPly } from "../../../test/games.ts";
import {
  putCachedRawEval,
  putCachedReport,
  resetAnalysisCacheForTests,
  type CacheKeyParts,
} from "../analysis-cache.ts";
import { analyzeGameInBrowser } from "../analyze-game-in-browser.ts";
import { ENGINE_BUILD } from "../engine-asset.ts";

vi.mock("../create-browser-engine-session.ts", () => ({
  createBrowserEngineSession: vi.fn(),
}));

import { createBrowserEngineSession } from "../create-browser-engine-session.ts";

afterEach(async () => {
  await resetAnalysisCacheForTests();
});

/**
 * In-memory Transport — same shape as
 * `libs/infra/engine/tests/fake-transport.ts`, duplicated locally rather
 * than imported across package test boundaries (a test-only helper, not
 * production logic). `send()` auto-answers the UCI handshake; `go`
 * replies with whatever the test queued. `stop` mimics a real engine:
 * if no response was queued yet, it answers immediately — "stop" always
 * produces a bestmove promptly, it doesn't leave the search hanging.
 */
class ScriptedTransport implements Transport {
  closed = false;
  /** Every `go` the engine was actually asked to search — a cache hit
   * must never increment this. */
  goCallCount = 0;
  private readonly queue: string[] = [];
  private waiting: ((line: string) => void) | null = null;
  private readonly goResponses: string[][] = [];
  private awaitingGo = false;

  queueGoResponse(lines: string[]): void {
    this.goResponses.push(lines);
  }

  send(command: string): void {
    if (command === "uci") this.push("uciok");
    else if (command === "isready") this.push("readyok");
    else if (command.startsWith("go")) {
      this.goCallCount++;
      const lines = this.goResponses.shift();
      if (lines) {
        for (const line of lines) this.push(line);
      } else {
        // Left pending until a response is queued or the transport stops.
        this.awaitingGo = true;
      }
    } else if (command === "stop" && this.awaitingGo) {
      this.awaitingGo = false;
      this.push("bestmove (none)");
    }
  }

  private push(line: string): void {
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve(line);
    } else {
      this.queue.push(line);
    }
  }

  async *lines(): AsyncIterable<string> {
    while (true) {
      const queued = this.queue.shift();
      if (queued !== undefined) {
        yield queued;
        continue;
      }
      yield await new Promise<string>((resolve) => {
        this.waiting = resolve;
      });
    }
  }

  close(): void {
    this.closed = true;
  }
}

function goLines(cp: number, bestMove: string, depth = 14): string[] {
  return [
    `info depth ${depth} multipv 1 score cp ${cp} pv ${bestMove}`,
    `bestmove ${bestMove}`,
  ];
}

/** "1. e4 e5" — 2 plies, needing 3 searches: before e4, before e5, after e5. */
const TWO_PLY_PGN = '[Event "Test"]\n\n1. e4 e5 *\n';

function mockEngine() {
  const transports: ScriptedTransport[] = [];
  vi.mocked(createBrowserEngineSession).mockImplementation(async () => {
    const transport = new ScriptedTransport();
    transports.push(transport);
    return new EngineSession(transport);
  });
  return transports;
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

describe("analyzeGameInBrowser", () => {
  it("streams one classified GradedPly per ply, in order", async () => {
    const transports = mockEngine();
    const controller = new AbortController();
    const gen = analyzeGameInBrowser("game-1", TWO_PLY_PGN, 14, controller.signal);

    const run = collect(gen);
    await vi.waitFor(() => expect(transports).toHaveLength(1));
    // 3 searches for 2 plies: before e4, before e5 (= after e4), after e5.
    transports[0]!.queueGoResponse(goLines(20, "e2e4"));
    transports[0]!.queueGoResponse(goLines(15, "e7e5"));
    transports[0]!.queueGoResponse(goLines(10, "g1f3"));

    const graded = await run;
    expect(graded.map((p) => p.san)).toEqual(["e4", "e5"]);
    expect(createBrowserEngineSession).toHaveBeenCalledTimes(1);
  });

  it("aborting stops the in-flight search and ends the stream without the next ply", async () => {
    const transports = mockEngine();
    const controller = new AbortController();
    const gen = analyzeGameInBrowser("game-1", TWO_PLY_PGN, 14, controller.signal);

    const firstPly = gen.next();
    await vi.waitFor(() => expect(transports).toHaveLength(1));
    // Answers search 1, then search 2 — the second unlocks ply 1.
    transports[0]!.queueGoResponse(goLines(1, "e2e4"));
    transports[0]!.queueGoResponse(goLines(2, "e7e5"));

    const ply1 = await firstPly;
    expect(ply1.done).toBe(false);
    expect(ply1.value.san).toBe("e4");

    // Search 3 (after e5) is now in flight with no response queued.
    // Abort: `stop` resolves it immediately (like a real engine), and the
    // generator notices `signal.aborted` once that resolves — never
    // yielding ply 2.
    controller.abort();
    const ply2 = await gen.next();
    expect(ply2.done).toBe(true);
  });

  it("propagates an engine init failure as a rejection", async () => {
    vi.mocked(createBrowserEngineSession).mockRejectedValue(new Error("no WASM support"));
    const controller = new AbortController();
    await expect(
      collect(analyzeGameInBrowser("game-1", TWO_PLY_PGN, 14, controller.signal)),
    ).rejects.toThrow("no WASM support");
  });

  it("returns a cached report without ever touching the engine", async () => {
    mockEngine();
    const parts: CacheKeyParts = { depth: 14, multiPV: 1, engineBuild: ENGINE_BUILD };
    const cached = [aGradedPly(1), aGradedPly(2)];
    await putCachedReport("game-1", POLICY_VERSION, parts, cached);

    const controller = new AbortController();
    const graded = await collect(
      analyzeGameInBrowser("game-1", TWO_PLY_PGN, 14, controller.signal),
    );

    expect(graded).toEqual(cached);
    expect(createBrowserEngineSession).not.toHaveBeenCalled();
  });

  it("skips the engine for a batch-prefetched position but still searches a miss", async () => {
    const [game] = parsePgn(TWO_PLY_PGN);
    const replay = replayMainline(game!).unwrap();
    const [firstFen] = fensToEvaluate(replay);

    const parts: CacheKeyParts = { depth: 14, multiPV: 1, engineBuild: ENGINE_BUILD };
    await putCachedRawEval(firstFen!, parts, { score: { cp: 5 }, bestMove: "e2e4" });

    const transports = mockEngine();
    const controller = new AbortController();
    const run = collect(
      analyzeGameInBrowser("game-1", TWO_PLY_PGN, 14, controller.signal),
    );

    await vi.waitFor(() => expect(transports).toHaveLength(1));
    // Only the 2 positions the batch prefetch missed — before e5, after e5.
    transports[0]!.queueGoResponse(goLines(15, "e7e5"));
    transports[0]!.queueGoResponse(goLines(10, "g1f3"));

    const graded = await run;
    expect(graded.map((p) => p.san)).toEqual(["e4", "e5"]);
    expect(transports[0]!.goCallCount).toBe(2);
  });
});
