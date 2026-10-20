import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fensToEvaluate, POLICY_VERSION, type GradedPly } from "@velachess/analysis";
import { parsePgn, replayMainline } from "@velachess/chess";
import { useEngineSession } from "@velachess/infra-engine";

import { call, run } from "../../../libs/effection.ts";
import { aGradedPly } from "../../../test/games.ts";
import {
  putCachedRawEval,
  putCachedReport,
  resetAnalysisCacheForTests,
  MULTI_PV,
  type CacheKeyParts,
} from "../analysis-cache.ts";
import {
  analyzeGameInBrowser,
  type GameAnalysisInput,
} from "../game/analyze-game-in-browser.ts";
import { ENGINE_BUILD } from "../../../engine/index.ts";
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
  await resetAnalysisCacheForTests();
});

const DEPTH = 14;
const parts: CacheKeyParts = {
  depth: DEPTH,
  multiPV: MULTI_PV,
  engineBuild: ENGINE_BUILD,
};

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
  return { gameId, rawPgn: TWO_PLY_PGN, depth: DEPTH };
}

describe("analyzeGameInBrowser", () => {
  it("streams one classified GradedPly per ply, in order", async () => {
    const engines = mockEngine();
    const { seen, task } = collect(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    // 3 searches for 2 plies: before e4, before e5 (= after e4), after e5.
    engines[0]!.queueGoResponse(goLines(20, "e2e4"));
    engines[0]!.queueGoResponse(goLines(15, "e7e5"));
    engines[0]!.queueGoResponse(goLines(10, "g1f3"));

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

  it("returns a cached report without ever touching the engine", async () => {
    mockEngine();
    const cached = [aGradedPly(1), aGradedPly(2)];
    await putCachedReport("game-1", POLICY_VERSION, parts, cached);

    const { seen, task } = collect(input());
    await task;

    expect(seen).toEqual(cached);
    expect(openBrowserEngineSession).not.toHaveBeenCalled();
  });

  it("writes the finished report through, so a second pass is engine-free", async () => {
    const engines = mockEngine();
    const first = collect(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    engines[0]!.queueGoResponse(goLines(20, "e2e4"));
    engines[0]!.queueGoResponse(goLines(15, "e7e5"));
    engines[0]!.queueGoResponse(goLines(10, "g1f3"));
    await first.task;

    vi.mocked(openBrowserEngineSession).mockClear();
    const second = collect(input());
    await second.task;

    expect(second.seen).toEqual(first.seen);
    expect(openBrowserEngineSession).not.toHaveBeenCalled();
  });

  it("skips the engine for a batch-prefetched position but still searches a miss", async () => {
    const [game] = parsePgn(TWO_PLY_PGN);
    const replay = replayMainline(game!).unwrap();
    const [firstFen] = fensToEvaluate(replay);
    await putCachedRawEval(firstFen!, parts, { score: { cp: 5 }, bestMove: "e2e4" });

    const engines = mockEngine();
    const { seen, task } = collect(input());

    await vi.waitFor(() => expect(engines).toHaveLength(1));
    // Only the 2 positions the batch prefetch missed — before e5, after e5.
    engines[0]!.queueGoResponse(goLines(15, "e7e5"));
    engines[0]!.queueGoResponse(goLines(10, "g1f3"));

    await task;
    expect(seen.map((ply) => ply.ply)).toEqual([1, 2]);
    expect(engines[0]!.goCallCount).toBe(2);
  });
});
