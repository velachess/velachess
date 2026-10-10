/**
 * The one piece of browser-side analysis logic: stream the existing
 * `analyzeGame()` (`@velachess/analysis`, unchanged) against a fresh
 * browser engine session, one `GradedPly` at a time. Cancellation is a
 * plain `AbortSignal` — the same convention `analysis-contract.ts`'s own
 * `runAnalysis(gameId, signal)` already uses for its SSE stream — so
 * `use-browser-analysis.ts` can drive this with React Query's
 * `experimental_streamedQuery` exactly the way it already drives that one.
 */
import { parsePgn } from "@velachess/chess";
import type { EngineSession } from "@velachess/infra-engine";
import { analyzeGame, type AnalysisEvent, type GradedPly } from "@velachess/analysis";

import { createBrowserEngineSession } from "./create-browser-engine-session.ts";

/** `AnalysisEvent["type"]`'s values, named — `satisfies` ties this to the
 * real union, so a typo or a drift after that type changes is a type
 * error here, not a silently-never-matching string at runtime. */
const ANALYSIS_EVENT = {
  POSITION: "position",
  DONE: "done",
} as const satisfies Record<string, AnalysisEvent["type"]>;

export async function* analyzeGameInBrowser(
  rawPgn: string,
  depth: number,
  signal: AbortSignal,
): AsyncGenerator<GradedPly> {
  const [game] = parsePgn(rawPgn);
  if (!game) return;

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
    for await (const event of analyzeGame(game, makeSession, { depth })) {
      if (signal.aborted) return;
      if (event.type === ANALYSIS_EVENT.POSITION) yield event.position;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
