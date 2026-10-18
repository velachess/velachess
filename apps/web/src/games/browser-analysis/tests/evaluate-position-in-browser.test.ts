import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { useEngineSession } from "@velachess/infra-engine";

import { call, run } from "../../../libs/effection.ts";
import {
  getCachedRawEval,
  putCachedRawEval,
  resetAnalysisCacheForTests,
  MULTI_PV,
  type CacheKeyParts,
} from "../analysis-cache.ts";
import { ENGINE_BUILD } from "../engine-asset.ts";
import { evaluatePositionInBrowser } from "../evaluate-position-in-browser.ts";
import { createScriptedEngine, goLines, type ScriptedEngine } from "./scripted-engine.ts";

vi.mock("../open-browser-engine-session.ts", () => ({
  openBrowserEngineSession: vi.fn(),
}));

import { openBrowserEngineSession } from "../open-browser-engine-session.ts";

afterEach(async () => {
  await resetAnalysisCacheForTests();
});

const DEPTH = 14;
const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const parts: CacheKeyParts = {
  depth: DEPTH,
  multiPV: MULTI_PV,
  engineBuild: ENGINE_BUILD,
};

function mockEngine(onEngine?: (engine: ScriptedEngine) => void) {
  const engines: ScriptedEngine[] = [];
  vi.mocked(openBrowserEngineSession).mockImplementation(function* () {
    const engine = createScriptedEngine();
    onEngine?.(engine);
    engines.push(engine);
    return yield* useEngineSession(engine.open);
  });
  return engines;
}

describe("evaluatePositionInBrowser", () => {
  it("returns a cached raw eval without ever touching the engine", async () => {
    mockEngine();
    await putCachedRawEval(FEN, parts, { score: { cp: 7 }, bestMove: "e2e4" });

    const result = await run(() => evaluatePositionInBrowser({ fen: FEN, depth: DEPTH }));

    expect(result).toEqual({ score: { cp: 7 }, bestMove: "e2e4" });
    expect(openBrowserEngineSession).not.toHaveBeenCalled();
  });

  it("searches on a miss, returns the result, and writes it through to the cache", async () => {
    // Queued before the search starts, so the reply is deterministic
    // rather than racing the session's own handshake.
    mockEngine((engine) => engine.queueGoResponse(goLines(20, "e2e4")));

    const result = await run(() => evaluatePositionInBrowser({ fen: FEN, depth: DEPTH }));

    expect(result).toEqual({ score: { cp: 20 }, bestMove: "e2e4" });
    expect(await getCachedRawEval(FEN, parts)).toEqual(result);
  });

  it("reads back a bestmove of (none) as no move at all", async () => {
    mockEngine((engine) =>
      engine.queueGoResponse([
        "info depth 14 multipv 1 score mate -1 pv e2e4",
        "bestmove (none)",
      ]),
    );

    const result = await run(() => evaluatePositionInBrowser({ fen: FEN, depth: DEPTH }));

    expect(result).toEqual({ score: { mate: -1 }, bestMove: null });
  });

  it("halting mid-search tears the engine down", async () => {
    const engines = mockEngine();
    const task = run(() => evaluatePositionInBrowser({ fen: FEN, depth: DEPTH }));

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    await task.halt();

    expect(engines[0]!.closed).toBe(true);
  });

  it("propagates an engine init failure", async () => {
    const boom = new Error("no WASM support");
    vi.mocked(openBrowserEngineSession).mockImplementation(() =>
      call((): never => {
        throw boom;
      }),
    );

    await expect(
      run(() => evaluatePositionInBrowser({ fen: FEN, depth: DEPTH })),
    ).rejects.toBe(boom);
  });
});
