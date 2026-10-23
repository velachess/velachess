/**
 * Builds a `Worker` running the vendored Stockfish script and hands it to
 * `useEngineSession`, the session the server-side tests drive over a child
 * process. Every failure here means "never got started", and tears the
 * Worker down on the way out, the transport being a resource in this
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

/** Fixed rather than device-aware. */
const HASH_MB = 16;

/** What this adapter sets; see below for why `Threads` is not one. */
const UCI_OPTION = { HASH: "Hash" } as const;

export function* openBrowserEngineSession(): Operation<EngineSession> {
  const capability = yield* call(() => checkEngineCapability());
  if (!capability.ok) {
    throw new Error(`This browser can't run the engine (${capability.reason}).`);
  }

  // No Threads option: the lite-single build is single-threaded, and Hash
  // is the only UCI option this repo configures anywhere.
  const hash: EngineOption = { name: UCI_OPTION.HASH, value: HASH_MB };

  return yield* useEngineSession(
    () => useWorkerTransport(new Worker(ENGINE_SCRIPT_URL)),
    {
      uciOptions: [hash],
    },
  );
}
