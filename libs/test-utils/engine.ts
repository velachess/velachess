/** Real Stockfish (the npm JS build) over the child-process transport —
 * suites analyze real positions, just shallow. */

import { createRequire } from "node:module";

import { EngineSession } from "@velachess/infra-engine";
import { ChildProcessTransport } from "@velachess/infra-engine/transport-child-process";

const require = createRequire(import.meta.url);
const enginePath = require.resolve("stockfish/bin/stockfish-18-lite-single.js");

export async function makeStockfishSession(): Promise<EngineSession> {
  const session = new EngineSession(
    new ChildProcessTransport(process.execPath, [enginePath]),
  );
  await session.init();
  return session;
}
