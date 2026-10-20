import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
  getCachedRawEval,
  getCachedRawEvalsBatch,
  getCachedReport,
  putCachedRawEval,
  putCachedReport,
  resetAnalysisCacheForTests,
  setRawEvalCacheCapForTests,
  setReportCacheCapForTests,
  type CacheKeyParts,
} from "../analysis-cache.ts";

const PARTS: CacheKeyParts = {
  depth: 14,
  multiPV: 1,
  engineBuild: "stockfish-19-lite-single",
};
const FEN_A = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const FEN_B = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
const FEN_C = "rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2";

afterEach(async () => {
  await resetAnalysisCacheForTests();
});

describe("rawEval cache", () => {
  it("misses on a FEN never written", async () => {
    await expect(getCachedRawEval(FEN_A, PARTS)).resolves.toBeNull();
  });

  it("round-trips a written evaluation", async () => {
    await putCachedRawEval(FEN_A, PARTS, { score: { cp: 32 }, bestMove: "e2e4" });

    await expect(getCachedRawEval(FEN_A, PARTS)).resolves.toEqual({
      score: { cp: 32 },
      bestMove: "e2e4",
    });
  });

  it("keys on the full search configuration, not just the FEN", async () => {
    await putCachedRawEval(FEN_A, PARTS, { score: { cp: 32 }, bestMove: "e2e4" });

    await expect(getCachedRawEval(FEN_A, { ...PARTS, depth: 16 })).resolves.toBeNull();
    await expect(
      getCachedRawEval(FEN_A, { ...PARTS, engineBuild: "stockfish-19-lite" }),
    ).resolves.toBeNull();
  });

  it("evicts the least recently touched entry once over its cap", async () => {
    setRawEvalCacheCapForTests(1);

    await putCachedRawEval(FEN_A, PARTS, { score: { cp: 1 }, bestMove: null });
    await putCachedRawEval(FEN_B, PARTS, { score: { cp: 2 }, bestMove: null });

    await expect(getCachedRawEval(FEN_A, PARTS)).resolves.toBeNull();
    await expect(getCachedRawEval(FEN_B, PARTS)).resolves.toEqual({
      score: { cp: 2 },
      bestMove: null,
    });
  });

  it("a read-touched entry outlives an older one that was never read again", async () => {
    await putCachedRawEval(FEN_A, PARTS, { score: { cp: 1 }, bestMove: null });
    await putCachedRawEval(FEN_B, PARTS, { score: { cp: 2 }, bestMove: null });
    setRawEvalCacheCapForTests(2);

    // Touching A moves it ahead of B, even though A was written first.
    await getCachedRawEval(FEN_A, PARTS);
    await putCachedRawEval(FEN_C, PARTS, { score: { cp: 3 }, bestMove: null });

    await expect(getCachedRawEval(FEN_B, PARTS)).resolves.toBeNull();
    await expect(getCachedRawEval(FEN_A, PARTS)).resolves.not.toBeNull();
  });
});

describe("getCachedRawEvalsBatch", () => {
  it("returns only the FENs actually cached, leaving the rest out of the map", async () => {
    await putCachedRawEval(FEN_A, PARTS, { score: { cp: 32 }, bestMove: "e2e4" });

    const hits = await getCachedRawEvalsBatch([FEN_A, FEN_B], PARTS);

    expect(hits.size).toBe(1);
    expect(hits.get(FEN_A)).toEqual({ score: { cp: 32 }, bestMove: "e2e4" });
    expect(hits.has(FEN_B)).toBe(false);
  });

  it("returns an empty map for a game with nothing cached yet", async () => {
    const hits = await getCachedRawEvalsBatch([FEN_A, FEN_B], PARTS);

    expect(hits.size).toBe(0);
  });

  it("counts every batched entry as touched for LRU purposes", async () => {
    await putCachedRawEval(FEN_A, PARTS, { score: { cp: 1 }, bestMove: null });
    await putCachedRawEval(FEN_B, PARTS, { score: { cp: 2 }, bestMove: null });
    setRawEvalCacheCapForTests(2);

    // Batch-reading A moves it ahead of B, same as a single get() would.
    await getCachedRawEvalsBatch([FEN_A], PARTS);
    await putCachedRawEval(FEN_C, PARTS, { score: { cp: 3 }, bestMove: null });

    await expect(getCachedRawEval(FEN_B, PARTS)).resolves.toBeNull();
    await expect(getCachedRawEval(FEN_A, PARTS)).resolves.not.toBeNull();
  });
});

describe("report cache", () => {
  const POLICY_VERSION = 1;
  const POSITIONS = [
    {
      ply: 1,
      fen: FEN_A,
      san: "e4",
      evalBefore: {},
      evalAfter: { cp: 20 },
      bestMove: "e2e4",
      category: "best" as const,
      winChanceLoss: 0,
    },
  ];

  it("misses for a game never graded", async () => {
    await expect(getCachedReport("game-1", POLICY_VERSION, PARTS)).resolves.toBeNull();
  });

  it("round-trips a written report", async () => {
    await putCachedReport("game-1", POLICY_VERSION, PARTS, POSITIONS);

    await expect(getCachedReport("game-1", POLICY_VERSION, PARTS)).resolves.toEqual(
      POSITIONS,
    );
  });

  it("misses when the policy version moved on", async () => {
    await putCachedReport("game-1", POLICY_VERSION, PARTS, POSITIONS);

    await expect(
      getCachedReport("game-1", POLICY_VERSION + 1, PARTS),
    ).resolves.toBeNull();
  });

  it("evicts the least recently touched report once over its cap", async () => {
    setReportCacheCapForTests(1);

    await putCachedReport("game-1", POLICY_VERSION, PARTS, POSITIONS);
    await putCachedReport("game-2", POLICY_VERSION, PARTS, POSITIONS);

    await expect(getCachedReport("game-1", POLICY_VERSION, PARTS)).resolves.toBeNull();
    await expect(
      getCachedReport("game-2", POLICY_VERSION, PARTS),
    ).resolves.not.toBeNull();
  });
});
