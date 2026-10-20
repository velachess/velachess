import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { useEngineSession } from "@velachess/infra-engine";
import type { CompletedSearch } from "@velachess/infra-engine";

import { call, run } from "../../../libs/effection.ts";
import {
  openPositionEvaluator,
  positionEvaluationOf,
} from "../evaluate-position-in-browser.ts";
import {
  createScriptedEngine,
  goLines,
  type ScriptedEngine,
} from "../../../engine/tests/scripted-engine.ts";

// Mocked one level below the SDK: the real session lifecycle and UCI
// conversation run, only the Worker behind them is scripted.
vi.mock("../../../engine/browser-session.ts", () => ({
  openBrowserEngineSession: vi.fn(),
}));

import { openBrowserEngineSession } from "../../../engine/browser-session.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function searched(cp: number, move: string): CompletedSearch {
  return {
    lastInfo: { depth: 14, multipv: 1, score: { cp }, pv: [move] },
    bestMove: { move },
  };
}

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
  const evaluator = openPositionEvaluator();
  return {
    evaluator,
    evaluate: (fen: string) => run(() => evaluator.evaluate(fen)),
    close: () => run(() => evaluator.dispose()),
  };
}

describe("positionEvaluationOf", () => {
  it("keeps a white-to-move score as the engine reported it", () => {
    expect(positionEvaluationOf(FEN, searched(31, "e2e4"))).toEqual({
      score: { cp: 31 },
      bestMove: "e2e4",
    });
  });

  it("flips a black-to-move score into white POV", () => {
    expect(positionEvaluationOf(AFTER_E4, searched(31, "e7e5"))).toEqual({
      score: { cp: -31 },
      bestMove: "e7e5",
    });
  });

  it("reads (none) as no move rather than a move named (none)", () => {
    expect(positionEvaluationOf(FEN, { bestMove: { move: "(none)" } })).toEqual({
      score: {},
      bestMove: null,
    });
  });
});

describe("openPositionEvaluator", () => {
  it("searches the position and returns the engine's answer", async () => {
    // Queued before the search starts, so the reply is deterministic
    // rather than racing the session's own handshake.
    mockEngine((engine) => engine.queueGoResponse(goLines(20, "e2e4")));

    const held = open();
    expect(await held.evaluate(FEN)).toEqual({ score: { cp: 20 }, bestMove: "e2e4" });
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

  it("searches a repeated position again, remembering nothing between calls", async () => {
    // No store and no memo behind this evaluator.
    const openDb = vi.spyOn(indexedDB, "open");
    const engines = mockEngine((engine) => {
      engine.queueGoResponse(goLines(20, "e2e4"));
      engine.queueGoResponse(goLines(20, "e2e4"));
    });

    const held = open();
    await held.evaluate(FEN);
    await held.evaluate(FEN);

    expect(engines[0]!.goCallCount).toBe(2);
    expect(openDb).not.toHaveBeenCalled();
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
