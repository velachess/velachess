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
import { openPositionEvaluator } from "../position/evaluate-position-in-browser.ts";
import { ENGINE_BUILD } from "../../engine/index.ts";
import {
  createScriptedEngine,
  goLines,
  type ScriptedEngine,
} from "../../engine/tests/scripted-engine.ts";

// Mocked one level below the SDK: the real session lifecycle and UCI
// conversation run, only the Worker behind them is scripted.
vi.mock("../../engine/browser-session.ts", () => ({
  openBrowserEngineSession: vi.fn(),
}));

import { openBrowserEngineSession } from "../../engine/browser-session.ts";

afterEach(async () => {
  await resetAnalysisCacheForTests();
});

const DEPTH = 14;
const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
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

/** One evaluator per test, closed however the test ends. */
function open() {
  const evaluator = openPositionEvaluator(DEPTH);
  return {
    evaluator,
    evaluate: (fen: string) => run(() => evaluator.evaluate(fen)),
    close: () => run(() => evaluator.dispose()),
  };
}

describe("openPositionEvaluator", () => {
  it("returns a cached raw eval without ever touching the engine", async () => {
    mockEngine();
    await putCachedRawEval(FEN, parts, { score: { cp: 7 }, bestMove: "e2e4" });

    const held = open();
    const result = await held.evaluate(FEN);

    expect(result).toEqual({ score: { cp: 7 }, bestMove: "e2e4" });
    expect(openBrowserEngineSession).not.toHaveBeenCalled();
    await held.close();
  });

  it("searches on a miss, returns the result, and writes it through to the cache", async () => {
    // Queued before the search starts, so the reply is deterministic
    // rather than racing the session's own handshake.
    mockEngine((engine) => engine.queueGoResponse(goLines(20, "e2e4")));

    const held = open();
    const result = await held.evaluate(FEN);

    expect(result).toEqual({ score: { cp: 20 }, bestMove: "e2e4" });
    expect(await getCachedRawEval(FEN, parts)).toEqual(result);
    await held.close();
  });

  it("reads back a bestmove of (none) as no move at all", async () => {
    mockEngine((engine) =>
      engine.queueGoResponse([
        "info depth 14 multipv 1 score mate -1 pv e2e4",
        "bestmove (none)",
      ]),
    );

    const held = open();
    expect(await held.evaluate(FEN)).toEqual({ score: { mate: -1 }, bestMove: null });
    await held.close();
  });

  it("answers two positions on one Worker", async () => {
    const engines = mockEngine((engine) => {
      engine.queueGoResponse(goLines(20, "e2e4"));
      engine.queueGoResponse(goLines(-5, "e7e5"));
    });

    const held = open();
    await held.evaluate(FEN);
    await held.evaluate(AFTER_E4);

    expect(engines).toHaveLength(1);
    expect(engines[0]!.goCallCount).toBe(2);
    await held.close();
  });

  it("keeps its Worker when a search is cancelled, and answers the next position on it", async () => {
    const engines = mockEngine();

    const held = open();
    const abandoned = held.evaluate(FEN);
    await vi.waitFor(() => expect(engines).toHaveLength(1));
    // No reply queued: the search is in flight when the caller walks away.
    await abandoned.halt().catch(() => {});

    expect(engines[0]!.closed).toBe(false);
    engines[0]!.queueGoResponse(goLines(12, "e7e5"));
    expect(await held.evaluate(AFTER_E4)).toEqual({
      score: { cp: -12 },
      bestMove: "e7e5",
    });
    expect(engines).toHaveLength(1);

    await held.close();
  });

  it("tears the Worker down when the evaluator is disposed", async () => {
    const engines = mockEngine((engine) => engine.queueGoResponse(goLines(20, "e2e4")));

    const held = open();
    await held.evaluate(FEN);
    expect(engines[0]!.closed).toBe(false);

    await held.close();
    expect(engines[0]!.closed).toBe(true);
  });

  it("propagates an engine init failure", async () => {
    const boom = new Error("no WASM support");
    vi.mocked(openBrowserEngineSession).mockImplementation(() =>
      call((): never => {
        throw boom;
      }),
    );

    const held = open();
    await expect(held.evaluate(FEN)).rejects.toBe(boom);
    await held.close();
  });
});
