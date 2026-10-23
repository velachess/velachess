/**
 * Speaks only the postMessage side: the caller creates the Worker already
 * running a UCI engine and hands it in.
 */

import { createQueue, ensure, resource, type Operation } from "effection";

import type { Transport } from "./transport.ts";

export function useWorkerTransport(worker: Worker): Operation<Transport> {
  return resource(function* (provide) {
    const lines = createQueue<string, void>();

    const onMessage = (event: MessageEvent<string>) => lines.add(event.data);
    // A crashed Worker posts no final message, where a crashed child
    // process ends its readline iterator, so without this a waiting
    // consumer hangs.
    const onError = () => lines.close();

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    yield* ensure(() => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
      // Nothing more can arrive once the worker is gone.
      lines.close();
    });

    yield* provide({
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage takes no targetOrigin; that parameter belongs to window.postMessage
      send: (command) => worker.postMessage(command),
      lines,
    });
  });
}
