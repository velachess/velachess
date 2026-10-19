/**
 * The one piece of browser-side analysis logic: stream the existing
 * `analyzeGame()` (`@velachess/analysis`, unchanged) against a fresh
 * browser engine session, one `GradedPly` at a time. Cancellation is a
 * plain `AbortSignal` — the same convention `analysis-contract.ts`'s own
 * `runAnalysis(gameId, signal)` already uses for its SSE stream — so
 * `use-browser-analysis.ts` can drive this with React Query's
 * `experimental_streamedQuery` exactly the way it already drives that one.
 *
 * Caching sits around that same call, not inside it: a cached whole-game
 * report short-circuits before the engine is ever touched; otherwise
 * every FEN the game needs is batch-read from the rawEval store in one
 * IndexedDB transaction up front, and that pre-warmed map is what
 * `analyzeGame()`'s own per-ply loop checks — a hit is a synchronous
 * lookup (no engine call), a miss still searches and streams exactly as
 * before, one position at a time, then writes through on its own.
 */
import { parsePgn, replayMainline } from "@velachess/chess";
import type { EngineSession } from "@velachess/infra-engine";
import {
  analyzeGame,
  fensToEvaluate,
  POLICY_VERSION,
  type AnalysisEvent,
  type GradedPly,
  type RawEvalCache,
} from "@velachess/analysis";

import {
  getCachedRawEvalsBatch,
  getCachedReport,
  putCachedRawEval,
  putCachedReport,
  type CacheKeyParts,
} from "./analysis-cache.ts";
import { createBrowserEngineSession } from "./create-browser-engine-session.ts";
import { ENGINE_BUILD } from "./engine-asset.ts";

/** `AnalysisEvent["type"]`'s values, named — `satisfies` ties this to the
 * real union, so a typo or a drift after that type changes is a type
 * error here, not a silently-never-matching string at runtime. */
const ANALYSIS_EVENT = {
  POSITION: "position",
  DONE: "done",
} as const satisfies Record<string, AnalysisEvent["type"]>;

/** Fixed today — nothing in this app exposes a MultiPV control yet. Part
 * of the cache key anyway, so turning it on later invalidates what was
 * cached under the old, always-1 behavior instead of reading it back as
 * if it reflected more lines than the engine actually searched. */
const MULTI_PV = 1;

export async function* analyzeGameInBrowser(
  gameId: string,
  rawPgn: string,
  depth: number,
  signal: AbortSignal,
): AsyncGenerator<GradedPly> {
  const [game] = parsePgn(rawPgn);
  if (!game) return;

  const parts: CacheKeyParts = { depth, multiPV: MULTI_PV, engineBuild: ENGINE_BUILD };

  const cachedReport = await getCachedReport(gameId, POLICY_VERSION, parts);
  if (cachedReport) {
    yield* cachedReport;
    return;
  }

  const replay = replayMainline(game).unwrap();
  const prefetched = await getCachedRawEvalsBatch(fensToEvaluate(replay), parts);
  const cache: RawEvalCache = {
    get: (fen) => prefetched.get(fen) ?? null,
    put: (fen, raw) => putCachedRawEval(fen, parts, raw),
  };

  let session: EngineSession | undefined;
  const makeSession = async () => {
    session = await createBrowserEngineSession();
    return session;
  };
  // `stop()` hurries the in-flight search rather than killing it outright
  // — real UCI engines answer `stop` with a bestmove soon after, bounded
  // in the worst case by analyzeGame()'s own per-search watchdog. Once
  // that search resolves, analyzeGame() yields its next ply event; the
  // loop below sees `signal.aborted` and returns. Every yield in
  // analyzeGame() sits inside its own `try {...} finally { session.quit() }`,
  // so an early `return` out of this `for await` — which makes the
  // runtime call `.return()` on analyzeGame()'s generator, resuming it
  // right at that suspended yield — still runs that `finally`. Nothing
  // here duplicates that cleanup; it only needs to ask for it promptly.
  const onAbort = () => session?.stop();
  signal.addEventListener("abort", onAbort);

  try {
    for await (const event of analyzeGame(game, makeSession, { depth, cache })) {
      if (event.type === ANALYSIS_EVENT.DONE) {
        await putCachedReport(gameId, POLICY_VERSION, parts, event.positions);
        return;
      }
      if (signal.aborted) return;
      if (event.type === ANALYSIS_EVENT.POSITION) yield event.position;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
