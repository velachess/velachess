/**
 * In-memory Transport for deterministic session tests — no real process or
 * worker. `emit()` simulates a line arriving from the engine; `sent` records
 * every command the session sent, in order. `end()` simulates the
 * underlying process/worker going away mid-stream (e.g. a crash) without a
 * final line — the same shape `WorkerTransport` produces on the browser
 * Worker's native `error` event.
 */

import type { Transport } from "../transport.ts";

export class FakeTransport implements Transport {
  readonly sent: string[] = [];
  closed = false;
  private ended = false;

  private readonly queue: string[] = [];
  private readonly waiting: Array<(line: string | null) => void> = [];

  send(command: string): void {
    this.sent.push(command);
  }

  emit(line: string): void {
    const resolve = this.waiting.shift();
    if (resolve) resolve(line);
    else this.queue.push(line);
  }

  /** Simulates the underlying process/worker disappearing mid-stream — the
   * async iterable completes without a final line, same as a crashed
   * Worker's `lines()` would. */
  end(): void {
    this.ended = true;
    const resolve = this.waiting.shift();
    resolve?.(null);
  }

  async *lines(): AsyncIterable<string> {
    while (true) {
      const queued = this.queue.shift();
      if (queued !== undefined) {
        yield queued;
        continue;
      }
      if (this.ended) return;
      const line = await new Promise<string | null>((resolve) => {
        this.waiting.push(resolve);
      });
      if (line === null) return;
      yield line;
    }
  }

  close(): void {
    this.closed = true;
  }
}
