import { describe, expect, it } from "vitest";

import { WorkerTransport } from "../transport-worker.ts";

/**
 * Stands in for a real browser Worker — just enough surface
 * (postMessage/addEventListener/terminate) for WorkerTransport to drive.
 * `emit()` simulates the worker posting a message back.
 */
class FakeWorker {
  readonly posted: string[] = [];
  terminated = false;

  private readonly messageListeners: Array<(event: MessageEvent<string>) => void> = [];
  private readonly errorListeners: Array<() => void> = [];

  postMessage(data: string): void {
    this.posted.push(data);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    if (type === "message") this.messageListeners.push(listener);
    else if (type === "error") this.errorListeners.push(listener as () => void);
  }

  removeEventListener(): void {}

  terminate(): void {
    this.terminated = true;
  }

  emit(data: string): void {
    for (const listener of this.messageListeners)
      listener({ data } as MessageEvent<string>);
  }

  crash(): void {
    for (const listener of this.errorListeners) listener();
  }
}

function makeTransport() {
  const worker = new FakeWorker();
  const transport = new WorkerTransport(worker as unknown as Worker);
  return { worker, transport };
}

describe("WorkerTransport", () => {
  it("send() posts the raw command to the worker", () => {
    const { worker, transport } = makeTransport();
    transport.send("uci");
    expect(worker.posted).toEqual(["uci"]);
  });

  it("lines() yields a message that arrives after the consumer starts waiting", async () => {
    const { worker, transport } = makeTransport();
    const iterator = transport.lines()[Symbol.asyncIterator]();

    const pending = iterator.next();
    worker.emit("uciok");

    expect(await pending).toEqual({ value: "uciok", done: false });
  });

  it("lines() also delivers messages that arrived before anyone was listening", async () => {
    const { worker, transport } = makeTransport();

    worker.emit("id name Stockfish");
    worker.emit("uciok");

    const iterator = transport.lines()[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toBe("id name Stockfish");
    expect((await iterator.next()).value).toBe("uciok");
  });

  it("preserves message order under a mix of early and late emits", async () => {
    const { worker, transport } = makeTransport();
    const iterator = transport.lines()[Symbol.asyncIterator]();

    // Queued: no one is waiting on the iterator yet.
    worker.emit("first");
    expect((await iterator.next()).value).toBe("first");

    // Now waiting on the iterator, before the second emit arrives.
    const pending = iterator.next();
    worker.emit("second");
    expect(await pending).toEqual({ value: "second", done: false });
  });

  it("close() terminates the worker", () => {
    const { worker, transport } = makeTransport();
    transport.close();
    expect(worker.terminated).toBe(true);
  });

  it("a worker error ends lines() instead of hanging forever on a consumer already waiting", async () => {
    const { worker, transport } = makeTransport();
    const iterator = transport.lines()[Symbol.asyncIterator]();

    const pending = iterator.next();
    worker.crash();

    expect(await pending).toEqual({ value: undefined, done: true });
  });

  it("a worker error also ends lines() for a consumer that starts waiting afterwards", async () => {
    const { worker, transport } = makeTransport();
    worker.crash();

    const iterator = transport.lines()[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });
});
