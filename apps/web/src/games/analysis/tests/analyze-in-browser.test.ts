import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GradedPly } from "@velachess/analysis";
import { useEngineSession } from "@velachess/infra-engine";

import { call } from "../../../libs/effection.ts";
import { aGradedPly, aReplay } from "../../../test/games.ts";
import { getReport, resetAnalysisDbForTests, saveReport } from "../analysis-db.ts";
import { analyzeGameInBrowser } from "../game/analyze.ts";
import { ANALYSIS_EVENT, type GameAnalysisInput } from "../types.ts";
import {
  createScriptedEngine,
  goLines,
  type ScriptedEngine,
} from "../../../engine/tests/scripted-engine.ts";

// Mocked one level below the SDK: real sessions and real UCI, only the
// Worker is scripted.
vi.mock("../../../engine/browser-session.ts", () => ({
  openBrowserEngineSession: vi.fn(),
}));

import { openBrowserEngineSession } from "../../../engine/browser-session.ts";

afterEach(async () => {
  vi.restoreAllMocks();
  await resetAnalysisDbForTests();
});

/** "1. e4 e5" — 2 plies, needing 3 searches: before e4, before e5, after e5. */
const TWO_PLY_PGN = '[Event "Test"]\n\n1. e4 e5 *\n';

function mockEngine() {
  const engines: ScriptedEngine[] = [];
  vi.mocked(openBrowserEngineSession).mockImplementation(function* () {
    const engine = createScriptedEngine();
    engines.push(engine);
    return yield* useEngineSession(engine.open);
  });
  return engines;
}

/** Reads one pass: what it graded, and what it reported whole. */
function read(game: GameAnalysisInput, { stopAfter = Infinity } = {}) {
  const graded: GradedPly[] = [];
  const reports: (readonly GradedPly[])[] = [];

  const done = (async () => {
    for await (const event of analyzeGameInBrowser(game)) {
      if (event.type === ANALYSIS_EVENT.PLY_GRADED) graded.push(event.grade);
      if (event.type === ANALYSIS_EVENT.COMPLETED) reports.push(event.graded);
      if (graded.length >= stopAfter) break;
    }
  })();

  return { graded, reports, done };
}

function input(gameId = "game-1") {
  return { gameId, replay: aReplay(TWO_PLY_PGN) };
}

function answerEveryPosition(engine: ScriptedEngine): void {
  engine.queueGoResponse(goLines(20, "e2e4"));
  engine.queueGoResponse(goLines(15, "e7e5"));
  engine.queueGoResponse(goLines(10, "g1f3"));
}

describe("analyzeGameInBrowser", () => {
  it("grades every ply on one Worker, then reports the whole game", async () => {
    const engines = mockEngine();
    const pass = read(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    answerEveryPosition(engines[0]!);
    await pass.done;

    expect(pass.graded.map((ply) => ply.ply)).toEqual([1, 2]);
    expect(pass.reports).toEqual([pass.graded]);
    expect(openBrowserEngineSession).toHaveBeenCalledTimes(1);
    // The pass owns its session, so finishing is what ends the Worker.
    expect(engines[0]!.closed).toBe(true);
  });

  it("hands a stored report over whole, without ever touching the engine", async () => {
    mockEngine();
    const stored = [aGradedPly(1), aGradedPly(2)];
    await saveReport("game-1", stored);

    const pass = read(input());
    await pass.done;

    // One report, not one grade per ply: there is no progress to animate.
    expect(pass.reports).toEqual([stored]);
    expect(pass.graded).toEqual([]);
    expect(openBrowserEngineSession).not.toHaveBeenCalled();
  });

  it("writes the finished report through, so a second pass is engine-free", async () => {
    const engines = mockEngine();
    const first = read(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    answerEveryPosition(engines[0]!);
    await first.done;

    vi.mocked(openBrowserEngineSession).mockClear();
    const second = read(input());
    await second.done;

    expect(second.reports).toEqual([first.graded]);
    expect(openBrowserEngineSession).not.toHaveBeenCalled();
  });

  it("stores nothing for a pass that was abandoned part-way, and lets its Worker go", async () => {
    const engines = mockEngine();
    const pass = read(input(), { stopAfter: 1 });

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    engines[0]!.queueGoResponse(goLines(1, "e2e4"));
    engines[0]!.queueGoResponse(goLines(2, "e7e5"));
    await pass.done;

    expect(pass.graded).toHaveLength(1);
    expect(pass.reports).toEqual([]);
    expect(engines[0]!.closed).toBe(true);
    await expect(getReport("game-1")).resolves.toBeNull();
  });

  it("releases the Worker when the engine dies under the pass", async () => {
    const engines: ScriptedEngine[] = [];
    const boom = new Error("no WASM support");
    vi.mocked(openBrowserEngineSession)
      .mockImplementationOnce(function* () {
        const engine = createScriptedEngine();
        engines.push(engine);
        return yield* useEngineSession(engine.open);
      })
      // The retry infra runs on a fresh session has nowhere to go.
      .mockImplementationOnce(() =>
        call((): never => {
          throw boom;
        }),
      );

    const pass = read(input());
    await vi.waitFor(() => expect(engines).toHaveLength(1));
    engines[0]!.crash();

    await expect(pass.done).rejects.toBe(boom);
    expect(engines[0]!.closed).toBe(true);
    expect(pass.reports).toEqual([]);
  });

  it("propagates an engine init failure", async () => {
    const boom = new Error("no WASM support");
    vi.mocked(openBrowserEngineSession).mockImplementation(() =>
      call((): never => {
        throw boom;
      }),
    );

    await expect(read(input()).done).rejects.toBe(boom);
  });

  it("analyzes the game when the stored report cannot be read", async () => {
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    const engines = mockEngine();
    const pass = read(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    answerEveryPosition(engines[0]!);
    await pass.done;

    expect(pass.graded.map((ply) => ply.ply)).toEqual([1, 2]);
  });

  it("finishes the analysis when the report cannot be written", async () => {
    const engines = mockEngine();
    const pass = read(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    answerEveryPosition(engines[0]!);
    // The store, not the connection: this pass already opened the
    // database, so only the write can fail.
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    await expect(pass.done).resolves.toBeUndefined();
    expect(pass.graded.map((ply) => ply.ply)).toEqual([1, 2]);
  });
});
