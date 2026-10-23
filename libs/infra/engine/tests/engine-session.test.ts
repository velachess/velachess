import { run, scoped, sleep, spawn } from "effection";
import { describe, expect, it } from "vitest";

import { useEngineSession } from "../engine-session.ts";
import type { EngineUpdate, SearchOutcome } from "../types.ts";
import { CLOSED, createFakeEngine } from "./fake-transport.ts";

const INFO = "info depth 12 multipv 1 score cp 31 pv e2e4 e7e5";
const INFO_SECOND_LINE = "info depth 12 multipv 2 score cp 10 pv d2d4 d7d5";

describe("useEngineSession handshake", () => {
  it("completes uci/isready before handing the session out, then applies options", async () => {
    const engine = createFakeEngine({ handshake: true });

    await run(function* () {
      yield* useEngineSession(engine.open, {
        uciOptions: [{ name: "Hash", value: 16 }],
      });
    });

    expect(engine.sent).toEqual([
      "uci",
      "isready",
      "setoption name Hash value 16",
      "quit",
      CLOSED,
    ]);
  });

  it("fails on timeout and tears the transport down on the way out", async () => {
    const engine = createFakeEngine();

    await expect(
      run(function* () {
        yield* useEngineSession(engine.open, { handshakeTimeoutMs: 20 });
      }),
    ).rejects.toThrow(/handshake timed out after 20ms/);

    expect(engine.closed).toBe(true);
  });

  it("fails when the engine's stream ends mid-handshake", async () => {
    const engine = createFakeEngine({
      onCommand: (command, emit) => {
        if (command === "uci") emit("uciok");
        if (command === "isready") engine.end();
      },
    });

    await expect(
      run(function* () {
        yield* useEngineSession(engine.open);
      }),
    ).rejects.toThrow(/closed before completing the handshake/);

    expect(engine.closed).toBe(true);
  });

  it("sends quit while the engine can still hear it, before closing the transport", async () => {
    const engine = createFakeEngine({ handshake: true });

    await run(function* () {
      yield* scoped(function* () {
        yield* useEngineSession(engine.open);
      });
      expect(engine.closed).toBe(true);
    });

    expect(engine.sent.at(-2)).toBe("quit");
    expect(engine.sent.at(-1)).toBe(CLOSED);
  });
});

describe("EngineSession.search", () => {
  it("streams info lines, then returns what the search settled on", async () => {
    const engine = createFakeEngine({
      handshake: true,
      onCommand: (command, emit) => {
        if (command.startsWith("go"))
          emit(INFO, INFO_SECOND_LINE, "bestmove e2e4 ponder e7e5");
      },
    });

    const { updates, outcome } = await run(function* () {
      const session = yield* useEngineSession(engine.open);
      session.setPosition("fen-a");

      const search = yield* session.search({ kind: "depth", depth: 12 });
      const seen: EngineUpdate[] = [];
      let settled: SearchOutcome | undefined;
      while (!settled) {
        const next = yield* search.next();
        if (next.done) settled = next.value;
        else seen.push(next.value);
      }
      return { updates: seen, outcome: settled };
    });

    expect(engine.sent).toContain("position fen fen-a");
    expect(engine.sent).toContain("go depth 12");
    expect(updates.map((update) => update.multipv)).toEqual([1, 2]);
    // The ponder suggestion is read past, not kept.
    expect(outcome.bestMove).toEqual({ move: "e2e4" });
    // The outcome carries the last multipv-1 line, not the last line seen.
    expect(outcome.lastInfo?.score).toEqual({ cp: 31 });
  });

  it("returns a null bestMove when the stream ends before the engine answers", async () => {
    const engine = createFakeEngine({
      handshake: true,
      onCommand: (command) => {
        if (command.startsWith("go")) engine.end();
      },
    });

    const outcome = await run(function* () {
      const session = yield* useEngineSession(engine.open);
      const search = yield* session.search({ kind: "depth", depth: 12 });
      while (true) {
        const next = yield* search.next();
        if (next.done) return next.value;
      }
    });

    expect(outcome.bestMove).toBeNull();
  });

  it("stop() hurries the search, which still settles on the engine's reply", async () => {
    const engine = createFakeEngine({
      handshake: true,
      onCommand: (command, emit) => {
        if (command.startsWith("go")) emit(INFO);
        if (command === "stop") emit("bestmove e2e4");
      },
    });

    const outcome = await run(function* () {
      const session = yield* useEngineSession(engine.open);
      const search = yield* session.search({ kind: "depth", depth: 30 });

      const first = yield* search.next();
      expect(first.done).toBe(false);

      session.stop();
      const next = yield* search.next();
      if (!next.done) throw new Error("expected the search to settle after stop()");
      return next.value;
    });

    expect(engine.sent).toContain("stop");
    expect(outcome.bestMove).toEqual({ move: "e2e4" });
  });

  it("repeated reads after the search settled keep returning the same outcome", async () => {
    const engine = createFakeEngine({
      handshake: true,
      onCommand: (command, emit) => {
        if (command.startsWith("go")) emit("bestmove e2e4");
      },
    });

    const outcomes = await run(function* () {
      const session = yield* useEngineSession(engine.open);
      const search = yield* session.search({ kind: "depth", depth: 12 });
      const first = yield* search.next();
      const second = yield* search.next();
      return [first, second];
    });

    expect(outcomes[0]!.done).toBe(true);
    expect(outcomes[1]).toEqual(outcomes[0]);
  });

  it("a second search while one is in flight is a programming error, not a split stream", async () => {
    const engine = createFakeEngine({ handshake: true });

    await expect(
      run(function* () {
        const session = yield* useEngineSession(engine.open);
        yield* session.search({ kind: "depth", depth: 12 });
        yield* session.search({ kind: "depth", depth: 12 });
      }),
    ).rejects.toThrow(/previous search is still in flight/);
  });

  it("a new search may start once the previous one settled", async () => {
    const engine = createFakeEngine({
      handshake: true,
      onCommand: (command, emit) => {
        if (command.startsWith("go")) emit("bestmove e2e4");
      },
    });

    const searches = await run(function* () {
      const session = yield* useEngineSession(engine.open);
      let count = 0;
      for (const depth of [8, 10]) {
        const search = yield* session.search({ kind: "depth", depth });
        yield* search.next();
        count++;
      }
      return count;
    });

    expect(searches).toBe(2);
    expect(engine.sent.filter((command) => command.startsWith("go"))).toEqual([
      "go depth 8",
      "go depth 10",
    ]);
  });
});

describe("cancellation", () => {
  it("halting during the handshake tears the transport down", async () => {
    const engine = createFakeEngine();

    await run(function* () {
      const task = yield* spawn(function* () {
        yield* useEngineSession(engine.open, { handshakeTimeoutMs: 10_000 });
        yield* sleep(10_000);
      });
      yield* sleep(0);
      expect(engine.closed).toBe(false);

      yield* task.halt();
      expect(engine.closed).toBe(true);
    });
  });

  it("halting mid-search quits the engine and terminates the transport", async () => {
    const engine = createFakeEngine({
      handshake: true,
      onCommand: (command, emit) => {
        if (command.startsWith("go")) emit(INFO);
      },
    });

    await run(function* () {
      const task = yield* spawn(function* () {
        const session = yield* useEngineSession(engine.open);
        const search = yield* session.search({ kind: "depth", depth: 30 });
        while (true) {
          const next = yield* search.next();
          if (next.done) return;
        }
      });
      yield* sleep(0);
      expect(engine.sent).toContain("go depth 30");

      yield* task.halt();
      expect(engine.sent.at(-2)).toBe("quit");
      expect(engine.sent.at(-1)).toBe(CLOSED);
    });
  });
});
