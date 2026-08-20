/**
 * In-memory Transport for deterministic session tests — no real process or
 * worker. `emit()` simulates a line arriving from the engine; `sent` records
 * every command the session sent, in order.
 */

import type { Transport } from "../transport.ts";

export class FakeTransport implements Transport {
  readonly sent: string[] = [];
  closed = false;

  private readonly queue: string[] = [];
  private readonly waiting: Array<(line: string) => void> = [];

  send(command: string): void {
    this.sent.push(command);
  }

  emit(line: string): void {
    const resolve = this.waiting.shift();
    if (resolve) resolve(line);
    else this.queue.push(line);
  }

  async *lines(): AsyncIterable<string> {
    while (true) {
      const queued = this.queue.shift();
      if (queued !== undefined) {
        yield queued;
        continue;
      }
      yield await new Promise<string>((resolve) => {
        this.waiting.push(resolve);
      });
    }
  }

  close(): void {
    this.closed = true;
  }
}
