/**
 * Gate before ever constructing a Worker: the `stockfish-19-lite-single`
 * build this app serves (`engine-asset.ts`) is WASM SIMD only — no
 * non-SIMD fallback is shipped. Without SIMD, `WebAssembly.instantiate`
 * fails inside the Worker, where a caller only sees an opaque Worker
 * error instead of a clear "unsupported" result.
 */
import { simd } from "wasm-feature-detect";

export type EngineCapability =
  | { ok: true }
  | { ok: false; reason: "no-worker" | "no-wasm" };

export async function checkEngineCapability(): Promise<EngineCapability> {
  if (typeof Worker === "undefined") return { ok: false, reason: "no-worker" };
  if (typeof WebAssembly === "undefined") return { ok: false, reason: "no-wasm" };
  if (!(await simd())) return { ok: false, reason: "no-wasm" };
  return { ok: true };
}
