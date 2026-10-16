/**
 * On-demand evaluation for a single ad-hoc FEN — a user exploring an
 * alternate move on the review board, not a position from the replayed
 * game. Same engine-calling path as `analyzeGameInBrowser` (a fresh
 * `createBrowserEngineSession`, the IndexedDB `rawEval` store as the
 * cache, `evaluatePositions()`'s own retry-on-crash), just one position
 * instead of a whole game's worth.
 *
 * Checked against the cache itself first, before `evaluatePositions()` is
 * ever called: that function always spins up a session up front (cheap to
 * amortize over a whole game's positions, wasteful to pay just to
 * immediately discard on a single-FEN cache hit).
 */
import { evaluatePositions, type RawEval, type RawEvalCache } from "@velachess/analysis";
import type { EngineSession } from "@velachess/infra-engine";

import {
  getCachedRawEval,
  putCachedRawEval,
  type CacheKeyParts,
} from "./analysis-cache.ts";
import { createBrowserEngineSession } from "./create-browser-engine-session.ts";
import { ENGINE_BUILD } from "./engine-asset.ts";

/** Matches `analyzeGameInBrowser` — no MultiPV control exposed anywhere
 * in this app yet. */
const MULTI_PV = 1;

export async function evaluatePositionInBrowser(
  fen: string,
  depth: number,
  signal: AbortSignal,
): Promise<RawEval> {
  const parts: CacheKeyParts = { depth, multiPV: MULTI_PV, engineBuild: ENGINE_BUILD };

  const cached = await getCachedRawEval(fen, parts);
  if (cached) return cached;

  const cache: RawEvalCache = {
    get: (f) => getCachedRawEval(f, parts),
    put: (f, raw) => putCachedRawEval(f, parts, raw),
  };

  // Same trick as analyzeGameInBrowser: `evaluatePositions()` never
  // exposes the session it creates, so this wrapper leaks a reference to
  // it for `stop()` — the abort handler hurries the in-flight search
  // instead of leaving it to run to completion for a result nobody wants.
  let session: EngineSession | undefined;
  const makeSession = async () => {
    session = await createBrowserEngineSession();
    return session;
  };
  const onAbort = () => session?.stop();
  signal.addEventListener("abort", onAbort);

  try {
    const [result] = await evaluatePositions([fen], makeSession, { depth, cache });
    return result!;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
