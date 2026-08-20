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

  private readonly listeners: Array<(event: MessageEvent<string>) => void> = [];

  postMessage(data: string): void {
    this.posted.push(data);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    if (type === "message") this.listeners.push(listener);
  }

  removeEventListener(): void {}

  terminate(): void {
    this.terminated = true;
  }

  emit(data: string): void {
    for (const listener of this.listeners) listener({ data } as MessageEvent<string>);
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

    worker.emit("first"); // queued, no one waiting yet
    expect((await iterator.next()).value).toBe("first");

    const pending = iterator.next(); // now waiting
    worker.emit("second");
    expect(await pending).toEqual({ value: "second", done: false });
  });

  it("close() terminates the worker", () => {
    const { worker, transport } = makeTransport();
    transport.close();
    expect(worker.terminated).toBe(true);
  });
});
