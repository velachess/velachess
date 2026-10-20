/**
 * Browser wiring for the engine adapter — nothing here speaks UCI. It
 * builds a `Worker` running the vendored Stockfish script and hands it to
 * `useEngineSession` (the same session the server-side tests drive over a
 * child process). Every failure here — unsupported environment, asset load
 * failure, handshake timeout — means "never got started", and tears the
 * Worker down on the way out because the transport is a resource in this
 * operation's scope.
 */
import { call, type Operation } from "../libs/effection.ts";
import {
  useEngineSession,
  type EngineOption,
  type EngineSession,
} from "@velachess/infra-engine";
import { useWorkerTransport } from "@velachess/infra-engine/worker-transport";

import { checkEngineCapability } from "./check-engine-capability.ts";
import { ENGINE_SCRIPT_URL } from "./engine-asset.ts";

/** Conservative fixed default — not device-aware, a tuning knob for later. */
const HASH_MB = 16;

/** UCI option names this adapter sets. Only `Hash` today — see the
 * comment below for why `Threads` isn't one of them. */
const UCI_OPTION = { HASH: "Hash" } as const;

export function* openBrowserEngineSession(): Operation<EngineSession> {
  const capability = yield* call(() => checkEngineCapability());
  if (!capability.ok) {
    throw new Error(`This browser can't run the engine (${capability.reason}).`);
  }

  // No Threads option: the lite-single build is single-threaded. Hash is
  // the only UCI option configured anywhere in this repo today (server
  // production sets none at all).
  const hash: EngineOption = { name: UCI_OPTION.HASH, value: HASH_MB };

  return yield* useEngineSession(
    () => useWorkerTransport(new Worker(ENGINE_SCRIPT_URL)),
    {
      uciOptions: [hash],
    },
  );
}
