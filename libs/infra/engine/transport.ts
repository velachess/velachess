/**
 * The one contract every environment implements differently. A transport
 * knows how to send a raw UCI command and yield the raw lines that come
 * back — nothing about what the lines mean.
 */
export interface Transport {
  send(command: string): void;
  lines(): AsyncIterable<string>;
  close(): void;
}
