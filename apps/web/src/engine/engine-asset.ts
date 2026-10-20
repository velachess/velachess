/**
 * Copied into `public/engine/` by `vite.config.ts` from the installed
 * `stockfish` npm package. Served as a plain static asset — the script is
 * a classic (non-module) Emscripten build that resolves its own `.wasm` by
 * swapping this URL's extension, so it must stay co-located with that file
 * under the same basename.
 */
export const ENGINE_SCRIPT_URL = "/engine/stockfish-19-lite-single.js";

/** Identifies the engine build in a cache key — swapping the wasm binary
 * invalidates every cached evaluation and report at once rather than
 * reading back a score an older build searched to. */
export const ENGINE_BUILD = "stockfish-19-lite-single";
