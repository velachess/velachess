/** Real Stockfish (the npm JS build) over the child-process transport —
 * suites analyze real positions, just shallow. */

import { createRequire } from "node:module";

import { useEngineSession, type EngineSession } from "@velachess/infra-engine";
import { useChildProcessTransport } from "@velachess/infra-engine/child-process-transport";
import type { Operation } from "effection";

const require = createRequire(import.meta.url);
const enginePath = require.resolve("stockfish/bin/stockfish-19-lite-single.js");

export function openStockfishSession(): Operation<EngineSession> {
  return useEngineSession(() => useChildProcessTransport(process.execPath, [enginePath]));
}
