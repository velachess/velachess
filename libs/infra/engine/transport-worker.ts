/**
 * Browser-only. Wraps a `Worker` that's already running a UCI engine (WASM
 * or otherwise) — this file only speaks the postMessage side of that
 * conversation. It doesn't load the engine script or know where the wasm
 * asset lives; the caller creates the Worker and hands it in.
 */

import type { Transport } from "./transport.ts";

export class WorkerTransport implements Transport {
  private readonly worker: Worker;
  private readonly queue: string[] = [];
  private pending: ((result: IteratorResult<string>) => void) | null = null;
  /** Set once the worker reports an error. A crashed child process closes
   * its stdout, which ends `ChildProcessTransport`'s readline iterator
   * naturally; a crashed Worker posts no final message of its own, so
   * without this a pending `lines()` consumer would wait forever instead
   * of seeing the stream end the same way. */
  private closed = false;

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.addEventListener("message", (event: MessageEvent<string>) => {
      this.deliver(event.data);
    });
    this.worker.addEventListener("error", () => {
      this.closed = true;
      const resolve = this.pending;
      this.pending = null;
      resolve?.({ done: true, value: undefined });
    });
  }

  private deliver(line: string): void {
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      resolve({ done: false, value: line });
    } else {
      this.queue.push(line);
    }
  }

  send(command: string): void {
    this.worker.postMessage(command);
  }

  async *lines(): AsyncIterable<string> {
    while (true) {
      const queued = this.queue.shift();
      if (queued !== undefined) {
        yield queued;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<string>>((resolve) => {
        this.pending = resolve;
      });
      if (result.done) return;
      yield result.value;
    }
  }

  close(): void {
    this.closed = true;
    this.worker.terminate();
  }
}
