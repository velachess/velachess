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
  private pending: ((line: string) => void) | null = null;

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.addEventListener("message", (event: MessageEvent<string>) => {
      if (this.pending) {
        const resolve = this.pending;
        this.pending = null;
        resolve(event.data);
      } else {
        this.queue.push(event.data);
      }
    });
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
      yield await new Promise<string>((resolve) => {
        this.pending = resolve;
      });
    }
  }

  close(): void {
    this.worker.terminate();
  }
}
