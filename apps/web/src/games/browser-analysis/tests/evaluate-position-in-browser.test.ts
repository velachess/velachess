import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineSession, type Transport } from "@velachess/infra-engine";

import {
  getCachedRawEval,
  putCachedRawEval,
  resetAnalysisCacheForTests,
  type CacheKeyParts,
} from "../analysis-cache.ts";
import { ENGINE_BUILD } from "../engine-asset.ts";
import { evaluatePositionInBrowser } from "../evaluate-position-in-browser.ts";

vi.mock("../create-browser-engine-session.ts", () => ({
  createBrowserEngineSession: vi.fn(),
}));

import { createBrowserEngineSession } from "../create-browser-engine-session.ts";

afterEach(async () => {
  await resetAnalysisCacheForTests();
});

/** Same shape as `analyze-game-in-browser.test.ts`'s own copy — a
 * test-only helper, duplicated rather than imported across test files. */
class ScriptedTransport implements Transport {
  closed = false;
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

/**
 * `onTransport` fires synchronously right as each transport is built —
 * before `session.init()` or `go` can possibly run — so a test can queue
 * a `go` response deterministically instead of racing a `vi.waitFor()`
 * against the session's own init handshake.
 */
function mockEngine(onTransport?: (transport: ScriptedTransport) => void) {
  const transports: ScriptedTransport[] = [];
  vi.mocked(createBrowserEngineSession).mockImplementation(async () => {
    const transport = new ScriptedTransport();
    onTransport?.(transport);
    transports.push(transport);
    const session = new EngineSession(transport);
    // Real createBrowserEngineSession always awaits init() before handing
    // the session back — the mock must too, or EngineSession's own
    // ready guard rejects every setPosition()/go() this test drives.
    await session.init();
    return session;
  });
  return transports;
}

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("evaluatePositionInBrowser", () => {
  it("returns a cached raw eval without ever touching the engine", async () => {
    mockEngine();
    const parts: CacheKeyParts = { depth: 14, multiPV: 1, engineBuild: ENGINE_BUILD };
    await putCachedRawEval(FEN, parts, { score: { cp: 7 }, bestMove: "e2e4" });

    const controller = new AbortController();
    const result = await evaluatePositionInBrowser(FEN, 14, controller.signal);

    expect(result).toEqual({ score: { cp: 7 }, bestMove: "e2e4" });
    expect(createBrowserEngineSession).not.toHaveBeenCalled();
  });

  it("searches on a miss, returns the result, and writes it through to the cache", async () => {
    mockEngine((transport) => transport.queueGoResponse(goLines(20, "e2e4")));
    const controller = new AbortController();

    const result = await evaluatePositionInBrowser(FEN, 14, controller.signal);
    expect(result).toEqual({ score: { cp: 20 }, bestMove: "e2e4" });

    const parts: CacheKeyParts = { depth: 14, multiPV: 1, engineBuild: ENGINE_BUILD };
    expect(await getCachedRawEval(FEN, parts)).toEqual(result);
  });

  it("aborting hurries the in-flight search instead of leaving it to finish unwatched", async () => {
    const transports = mockEngine();
    const controller = new AbortController();
    const run = evaluatePositionInBrowser(FEN, 14, controller.signal);

    await vi.waitFor(() => expect(transports).toHaveLength(1));
    // No response queued — `go` is left pending until `stop` answers it,
    // exactly like a real in-flight search.
    controller.abort();

    const result = await run;
    expect(result.bestMove).toBeNull();
  });

  it("propagates an engine init failure as a rejection", async () => {
    vi.mocked(createBrowserEngineSession).mockRejectedValue(new Error("no WASM support"));
    const controller = new AbortController();

    await expect(evaluatePositionInBrowser(FEN, 14, controller.signal)).rejects.toThrow(
      "no WASM support",
    );
  });
});
