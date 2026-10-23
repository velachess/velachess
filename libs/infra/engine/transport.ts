/**
 * Sends a raw UCI command and yields the raw lines back, knowing nothing
 * about what they mean.
 *
 * `lines` is a Subscription rather than a Stream because two consumers
 * would split the replies between them: there is one reader, buffered from
 * the moment the transport opened, so a reply arriving before anyone waits
 * is not lost. Closing is the opening resource's job.
 */

import type { Operation, Subscription } from "effection";

export interface Transport {
  send(command: string): void;
  lines: Subscription<string, void>;
}

export type OpenTransport = () => Operation<Transport>;
