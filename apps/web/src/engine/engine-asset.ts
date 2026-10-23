/**
 * Copied into `public/engine/` by `vite.config.ts` from the installed
 * `stockfish` package. A classic Emscripten build that resolves its own
 * `.wasm` by swapping this URL's extension, so it stays co-located with
 * that file
 * under the same basename.
 */
export const ENGINE_SCRIPT_URL = "/engine/stockfish-19-lite-single.js";

/** In a cache key, so swapping the wasm binary invalidates every cached
 * report rather than reading back an older build's score. */
export const ENGINE_BUILD = "stockfish-19-lite-single";
