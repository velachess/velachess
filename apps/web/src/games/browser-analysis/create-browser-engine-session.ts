/**
 * Browser wiring for the engine adapter — nothing here speaks UCI. It
 * builds a `Worker` running the vendored Stockfish script, hands it to
 * the existing `WorkerTransport`/`EngineSession` (unchanged, same classes
 * the server uses over `ChildProcessTransport`), and completes the
 * handshake. Every failure here — unsupported environment, asset load
 * failure, handshake timeout — means "never got started": the caller
 * treats it as an init-time error, distinct from a failure mid-run.
 */
import { EngineSession, type EngineOption } from "@velachess/infra-engine";
import { WorkerTransport } from "@velachess/infra-engine/transport-worker";

import { ENGINE_SCRIPT_URL } from "./engine-asset.ts";

/** Conservative fixed default — not device-aware, a tuning knob for later. */
const DEFAULT_HASH_MB = 16;

function isBrowserEngineSupported(): boolean {
  return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
}

export async function createBrowserEngineSession(
  options: { hashMb?: number } = {},
): Promise<EngineSession> {
  if (!isBrowserEngineSupported()) {
    throw new Error("This browser doesn't support Worker/WebAssembly.");
  }

  const worker = new Worker(ENGINE_SCRIPT_URL);
  const transport = new WorkerTransport(worker);
  const session = new EngineSession(transport);
  await session.init();

  // No Threads option: the lite-single build is single-threaded. Hash is
  // the only UCI option configured anywhere in this repo today (server
  // production sets none at all).
  const hash: EngineOption = { name: "Hash", value: options.hashMb ?? DEFAULT_HASH_MB };
  session.setOption(hash);

  return session;
}
