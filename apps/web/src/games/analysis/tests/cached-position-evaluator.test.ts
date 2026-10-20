import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import type { RawEval } from "@velachess/analysis";
import type { CompletedSearch } from "@velachess/infra-engine";

import { call, run, type Operation } from "../../../libs/effection.ts";
import {
  getCachedRawEval,
  resetAnalysisCacheForTests,
  MULTI_PV,
  type CacheKeyParts,
} from "../analysis-cache.ts";
import { cachedPositionEvaluator, rawEvalOf } from "../cached-position-evaluator.ts";
import { ENGINE_BUILD } from "../../../engine/index.ts";

afterEach(async () => {
  await resetAnalysisCacheForTests();
});

const parts: CacheKeyParts = { depth: 14, multiPV: MULTI_PV, engineBuild: ENGINE_BUILD };

const WHITE_TO_MOVE = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_TO_MOVE = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function search(cp: number, move: string): CompletedSearch {
  return {
    lastInfo: { depth: 14, multipv: 1, score: { cp }, pv: [move] },
    bestMove: { move },
  };
}

function spyEngine(...results: CompletedSearch[]) {
  const asked: string[] = [];
  const queued = [...results];
  return {
    asked,
    search: (fen: string): Operation<CompletedSearch> =>
      call(() => {
        asked.push(fen);
        const next = queued.shift();
        if (!next) throw new Error(`no scripted search left for ${fen}`);
        return next;
      }),
  };
}

describe("rawEvalOf", () => {
  it("keeps a white-to-move score as the engine reported it", () => {
    expect(rawEvalOf(WHITE_TO_MOVE, search(31, "e2e4"))).toEqual({
      score: { cp: 31 },
      bestMove: "e2e4",
    });
  });

  it("flips a black-to-move score into white POV", () => {
    expect(rawEvalOf(BLACK_TO_MOVE, search(31, "e7e5"))).toEqual({
      score: { cp: -31 },
      bestMove: "e7e5",
    });
  });

  it("reads (none) as no move rather than a move named (none)", () => {
    const outcome: CompletedSearch = { bestMove: { move: "(none)" } };
    expect(rawEvalOf(WHITE_TO_MOVE, outcome)).toEqual({ score: {}, bestMove: null });
  });
});

describe("cachedPositionEvaluator", () => {
  it("never reaches the engine for a position the lookup already has", async () => {
    const engine = spyEngine();
    const cached: RawEval = { score: { cp: 7 }, bestMove: "e2e4" };

    const result = await run(function* () {
      const evaluator = cachedPositionEvaluator({
        search: engine.search,
        parts,
        lookup: () => call(() => cached),
      });
      return yield* evaluator.evaluate(WHITE_TO_MOVE);
    });

    expect(result).toBe(cached);
    expect(engine.asked).toEqual([]);
  });

  it("searches a miss and writes the result through to the store", async () => {
    const engine = spyEngine(search(20, "e2e4"));

    const result = await run(function* () {
      const evaluator = cachedPositionEvaluator({
        search: engine.search,
        parts,
        lookup: () => call(() => null),
      });
      return yield* evaluator.evaluate(WHITE_TO_MOVE);
    });

    expect(result).toEqual({ score: { cp: 20 }, bestMove: "e2e4" });
    expect(engine.asked).toEqual([WHITE_TO_MOVE]);
    expect(await getCachedRawEval(WHITE_TO_MOVE, parts)).toEqual(result);
  });

  it("asks the lookup for every position, so a pre-warmed map shortcuts per FEN", async () => {
    const engine = spyEngine(search(20, "e2e4"));
    const warm = new Map<string, RawEval>([
      [BLACK_TO_MOVE, { score: { cp: -5 }, bestMove: "e7e5" }],
    ]);

    const results = await run(function* () {
      const evaluator = cachedPositionEvaluator({
        search: engine.search,
        parts,
        lookup: (fen) => call(() => warm.get(fen) ?? null),
      });
      return [
        yield* evaluator.evaluate(BLACK_TO_MOVE),
        yield* evaluator.evaluate(WHITE_TO_MOVE),
      ];
    });

    expect(results[0]).toEqual({ score: { cp: -5 }, bestMove: "e7e5" });
    expect(results[1]).toEqual({ score: { cp: 20 }, bestMove: "e2e4" });
    expect(engine.asked).toEqual([WHITE_TO_MOVE]);
  });
});
