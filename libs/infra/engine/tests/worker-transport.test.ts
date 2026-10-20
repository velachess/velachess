import { each, run, scoped, sleep, spawn } from "effection";
import { describe, expect, it } from "vitest";

import { useWorkerTransport } from "../worker-transport.ts";

/**
 * Stands in for a real browser Worker — just enough surface
 * (postMessage/addEventListener/removeEventListener/terminate) for the
 * transport to drive. `emit()` simulates the worker posting a message
 * back, `crash()` its native `error` event.
 */
class FakeWorker {
  readonly posted: string[] = [];
  terminated = false;

  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  postMessage(data: string): void {
    this.posted.push(data);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((total, set) => total + set.size, 0);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(...data: string[]): void {
    for (const value of data) {
      for (const listener of this.listeners.get("message") ?? []) {
        listener({ data: value });
      }
    }
  }

  crash(): void {
    for (const listener of this.listeners.get("error") ?? []) listener({});
  }
}

function asWorker(fake: FakeWorker): Worker {
  return fake as unknown as Worker;
}

describe("useWorkerTransport", () => {
  it("send() posts the raw command to the worker", async () => {
    const worker = new FakeWorker();

    await run(function* () {
      const transport = yield* useWorkerTransport(asWorker(worker));
      transport.send("uci");
    });

    expect(worker.posted).toEqual(["uci"]);
  });

  it("delivers messages that arrived before anyone was waiting, in order", async () => {
    const worker = new FakeWorker();

    const lines = await run(function* () {
      const transport = yield* useWorkerTransport(asWorker(worker));
      worker.emit("id name Stockfish", "uciok");

      const first = yield* transport.lines.next();
      const second = yield* transport.lines.next();
      return [first.value, second.value];
    });

    expect(lines).toEqual(["id name Stockfish", "uciok"]);
  });

  it("delivers a message that arrives after the consumer started waiting", async () => {
    const worker = new FakeWorker();

    const line = await run(function* () {
      const transport = yield* useWorkerTransport(asWorker(worker));

      const pending = yield* spawn(function* () {
        const result = yield* transport.lines.next();
        return result.value;
      });
      // A spawned task starts at the next opportunity; this lets it reach
      // the suspended read before the emit below, which is the case this
      // test exists for.
      yield* sleep(0);
      worker.emit("uciok");

      return yield* pending;
    });

    expect(line).toBe("uciok");
  });

  it("a worker error ends the line stream instead of hanging forever", async () => {
    const worker = new FakeWorker();

    const result = await run(function* () {
      const transport = yield* useWorkerTransport(asWorker(worker));
      worker.crash();
      return yield* transport.lines.next();
    });

    expect(result.done).toBe(true);
  });

  it("a worker error also ends the stream for a consumer already waiting", async () => {
    const worker = new FakeWorker();

    const result = await run(function* () {
      const transport = yield* useWorkerTransport(asWorker(worker));

      const pending = yield* spawn(() => transport.lines.next());
      yield* sleep(0);
      worker.crash();

      return yield* pending;
    });

    expect(result.done).toBe(true);
  });

  it("leaving the scope removes both listeners and terminates the worker", async () => {
    const worker = new FakeWorker();

    await run(function* () {
      yield* scoped(function* () {
        yield* useWorkerTransport(asWorker(worker));
        expect(worker.listenerCount()).toBe(2);
        expect(worker.terminated).toBe(false);
      });

      expect(worker.listenerCount()).toBe(0);
      expect(worker.terminated).toBe(true);
    });
  });

  it("each() walks the stream in order", async () => {
    const worker = new FakeWorker();

    const lines = await run(function* () {
      const transport = yield* useWorkerTransport(asWorker(worker));
      worker.emit("one", "two", "three");

      const seen: string[] = [];
      for (const line of yield* each(transport.lines)) {
        seen.push(line);
        if (seen.length === 3) break;
        yield* each.next();
      }
      return seen;
    });

    expect(lines).toEqual(["one", "two", "three"]);
  });
});
