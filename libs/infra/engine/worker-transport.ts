/**
 * Browser-only. Wraps a `Worker` that's already running a UCI engine (WASM
 * or otherwise) — this file only speaks the postMessage side of that
 * conversation. It doesn't load the engine script or know where the wasm
 * asset lives; the caller creates the Worker and hands it in.
 */

import { createQueue, ensure, resource, type Operation } from "effection";

import type { Transport } from "./transport.ts";

export function useWorkerTransport(worker: Worker): Operation<Transport> {
  return resource(function* (provide) {
    const lines = createQueue<string, void>();

    const onMessage = (event: MessageEvent<string>) => lines.add(event.data);
    // A crashed child process closes its stdout, which ends the readline
    // iterator naturally; a crashed Worker posts no final message of its
    // own, so without this a waiting consumer would hang instead of
    // seeing the stream end the same way.
    const onError = () => lines.close();

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    yield* ensure(() => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
      // Ends the stream rather than leaving it to suspend: nothing more
      // can arrive once the worker is gone.
      lines.close();
    });

    yield* provide({
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage takes no targetOrigin; that parameter belongs to window.postMessage
      send: (command) => worker.postMessage(command),
      lines,
    });
  });
}
