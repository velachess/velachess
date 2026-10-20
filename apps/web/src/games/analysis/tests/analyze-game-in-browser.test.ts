import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GradedPly } from "@velachess/analysis";
import { useEngineSession } from "@velachess/infra-engine";

import { call, run } from "../../../libs/effection.ts";
import { aGradedPly } from "../../../test/games.ts";
import { getReport, resetAnalysisDbForTests, saveReport } from "../analysis-db.ts";
import {
  analyzeGameInBrowser,
  type GameAnalysisInput,
} from "../analyze-game-in-browser.ts";
import {
  createScriptedEngine,
  goLines,
  type ScriptedEngine,
} from "../../../engine/tests/scripted-engine.ts";

// Mocked one level below the SDK: the real `createEngine` sessions, their
// lifecycle and their UCI conversation all run, only the Worker behind
// them is scripted.
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

/** Runs one pass and records every ply it published, as it publishes. */
function collect(game: GameAnalysisInput) {
  const seen: GradedPly[] = [];
  const task = run(() =>
    analyzeGameInBrowser(game, (ply) => {
      seen.push(ply);
    }),
  );
  return { seen, task };
}

function input(gameId = "game-1") {
  return { gameId, rawPgn: TWO_PLY_PGN };
}

/** The three replies a full pass over `TWO_PLY_PGN` consumes. */
function answerEveryPosition(engine: ScriptedEngine): void {
  engine.queueGoResponse(goLines(20, "e2e4"));
  engine.queueGoResponse(goLines(15, "e7e5"));
  engine.queueGoResponse(goLines(10, "g1f3"));
}

describe("analyzeGameInBrowser", () => {
  it("streams one classified GradedPly per ply, in order", async () => {
    const engines = mockEngine();
    const { seen, task } = collect(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    answerEveryPosition(engines[0]!);

    await task;
    expect(seen.map((ply) => ply.ply)).toEqual([1, 2]);
    expect(openBrowserEngineSession).toHaveBeenCalledTimes(1);
  });

  it("halting the pass tears the engine down mid-analysis", async () => {
    const engines = mockEngine();
    const { seen, task } = collect(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    engines[0]!.queueGoResponse(goLines(1, "e2e4"));
    engines[0]!.queueGoResponse(goLines(2, "e7e5"));
    await vi.waitFor(() => expect(seen).toHaveLength(1));

    // The third search is in flight with no reply queued. Halting must
    // not wait for it — the Worker simply goes away.
    await task.halt();
    expect(engines[0]!.closed).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it("stores nothing for a pass that was interrupted part-way", async () => {
    const engines = mockEngine();
    const { seen, task } = collect(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    engines[0]!.queueGoResponse(goLines(1, "e2e4"));
    engines[0]!.queueGoResponse(goLines(2, "e7e5"));
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    await task.halt();

    await expect(getReport("game-1")).resolves.toBeNull();
  });

  it("propagates an engine init failure", async () => {
    const boom = new Error("no WASM support");
    vi.mocked(openBrowserEngineSession).mockImplementation(() =>
      call((): never => {
        throw boom;
      }),
    );

    const { task } = collect(input());
    await expect(task).rejects.toBe(boom);
  });

  it("republishes a stored report without ever touching the engine", async () => {
    mockEngine();
    const stored = [aGradedPly(1), aGradedPly(2)];
    await saveReport("game-1", stored);

    const { seen, task } = collect(input());
    await task;

    expect(seen).toEqual(stored);
    expect(openBrowserEngineSession).not.toHaveBeenCalled();
  });

  it("writes the finished report through, so a second pass is engine-free", async () => {
    const engines = mockEngine();
    const first = collect(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    answerEveryPosition(engines[0]!);
    await first.task;

    vi.mocked(openBrowserEngineSession).mockClear();
    const second = collect(input());
    await second.task;

    expect(second.seen).toEqual(first.seen);
    expect(openBrowserEngineSession).not.toHaveBeenCalled();
  });

  it("analyzes the game when the stored report cannot be read", async () => {
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    const engines = mockEngine();
    const { seen, task } = collect(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    answerEveryPosition(engines[0]!);

    await task;
    expect(seen.map((ply) => ply.ply)).toEqual([1, 2]);
  });

  it("finishes the analysis when the report cannot be written", async () => {
    const engines = mockEngine();
    const { seen, task } = collect(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    answerEveryPosition(engines[0]!);
    // The store, not the connection: this pass already opened the
    // database for its own (missing) report, so only the write can fail.
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    await expect(task).resolves.toBeUndefined();
    expect(seen.map((ply) => ply.ply)).toEqual([1, 2]);
  });
});
