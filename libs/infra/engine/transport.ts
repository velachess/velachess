/**
 * The one contract every environment implements differently. A transport
 * knows how to send a raw UCI command and yield the raw lines that come
 * back — nothing about what the lines mean.
 *
 * `lines` is a Subscription rather than a Stream because two consumers
 * would split the engine's replies between them unpredictably: there is
 * exactly one reader, and it is buffered from the moment the transport
 * opened, so a reply that arrives before anyone waits is not lost.
 * Closing is the opening resource's job, which is why there is no
 * `close()` here.
 */

import type { Operation, Subscription } from "effection";

export interface Transport {
  send(command: string): void;
  lines: Subscription<string, void>;
}

export type OpenTransport = () => Operation<Transport>;
