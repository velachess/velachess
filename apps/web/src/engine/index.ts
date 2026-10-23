/**
 * [ENGINE] — Stockfish in the browser: a factory, independent sessions,
 * and the Workers they own. It runs searches and returns the engine's own
 * `CompletedSearch`; what a score means, what to cache and who is looking
 * at it all belong to `games/analysis` and `games/review`.
 */
import { openBrowserEngineSession } from "./browser-session.ts";
import { createEngine } from "./engine.ts";

export { ENGINE_BUILD } from "./engine-asset.ts";
export type { EngineSessionHandle } from "./engine.ts";

/** The app's engine: every session it hands out runs the vendored
 * Stockfish WASM build in a Worker of its own. */
export const browserEngine = createEngine({ openSession: openBrowserEngineSession });
