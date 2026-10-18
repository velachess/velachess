import { call, run, sleep, spawn, type Operation } from "effection";
import { describe, expect, it } from "vitest";

import { useEngineEvaluator, silenceTimeoutFor } from "../engine-evaluator.ts";
import { useEngineSession, type EngineSession } from "../engine-session.ts";
import {
  createFakeEngine,
  type FakeEngine,
  type FakeEngineOptions,
} from "./fake-transport.ts";

const INFO = "info depth 8 multipv 1 score cp 31 pv e2e4 e7e5";

/** Timeouts small enough that the whole suite is fast, large enough that a
 * scheduler hiccup can't look like a silent engine. */
const FAST = { depth: 8, silenceTimeoutMs: 30, graceMs: 30 } as const;

/** Answers the handshake and nothing else — the shape of a Worker whose
 * WASM module died after loading. */
const MUTE: FakeEngineOptions = { handshake: true };

function answering(move: string): FakeEngineOptions {
  return {
    handshake: true,
    onCommand: (command, emit) => {
      if (command.startsWith("go")) emit(INFO, `bestmove ${move}`);
    },
  };
}

/** A fresh fake engine per session, so a test can count how many the
 * evaluator opened and script each one differently. */
function sessions(optionsFor: (index: number) => FakeEngineOptions) {
  const engines: FakeEngine[] = [];
  return {
    engines,
    *open(): Operation<EngineSession> {
      const engine = createFakeEngine(optionsFor(engines.length));
      engines.push(engine);
      return yield* useEngineSession(engine.open);
    },
  };
}

function* flushUntil(predicate: () => boolean, label: string): Operation<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (predicate()) return;
    yield* sleep(0);
  }
  throw new Error(`gave up waiting for ${label}`);
}

describe("silenceTimeoutFor", () => {
  it("scales with depth, clamped to the range a real search can take", () => {
    expect(silenceTimeoutFor(1)).toBe(5000);
    expect(silenceTimeoutFor(20)).toBe(11_000);
    expect(silenceTimeoutFor(500)).toBe(30_000);
    expect(silenceTimeoutFor(20, 42)).toBe(42);
  });
});

describe("useEngineEvaluator", () => {
  it("returns the search the engine answered, on one session", async () => {
    const { engines, open } = sessions(() => answering("e2e4"));

    const search = await run(function* () {
      const evaluator = yield* useEngineEvaluator(open, FAST);
      return yield* evaluator.evaluate("fen-a");
    });

    expect(search.bestMove).toEqual({ move: "e2e4" });
    expect(search.lastInfo?.score).toEqual({ cp: 31 });
    expect(engines).toHaveLength(1);
  });

  it("hurries a silent engine with stop, then retries the position on a fresh session", async () => {
    const { engines, open } = sessions((index) =>
      index === 0 ? MUTE : answering("d2d4"),
    );

    const search = await run(function* () {
      const evaluator = yield* useEngineEvaluator(open, FAST);
      return yield* evaluator.evaluate("fen-a");
    });

    expect(search.bestMove).toEqual({ move: "d2d4" });
    expect(engines).toHaveLength(2);
    expect(engines[0]!.sent).toContain("stop");
    expect(engines[0]!.closed).toBe(true);
  });

  it("gives up on the position when a fresh session fails too", async () => {
    const { engines, open } = sessions(() => MUTE);

    await expect(
      run(function* () {
        const evaluator = yield* useEngineEvaluator(open, FAST);
        yield* evaluator.evaluate("fen-a");
      }),
    ).rejects.toThrow("Engine failed twice evaluating fen-a");

    expect(engines).toHaveLength(2);
  });

  it("budgets the retry per position, not per evaluator", async () => {
    // Session 0 is mute, so "fen-a" retries onto session 1. Session 1
    // answers once and then goes mute, so "fen-b" retries onto session 2.
    // A budget spent once per evaluator would abort the second position.
    const { engines, open } = sessions((index) => {
      if (index === 0) return MUTE;
      if (index === 1) {
        let answered = 0;
        return {
          handshake: true,
          onCommand: (command, emit) => {
            if (!command.startsWith("go")) return;
            answered++;
            if (answered === 1) emit(INFO, "bestmove e2e4");
          },
        };
      }
      return answering("g1f3");
    });

    const moves = await run(function* () {
      const evaluator = yield* useEngineEvaluator(open, FAST);
      const first = yield* evaluator.evaluate("fen-a");
      const second = yield* evaluator.evaluate("fen-b");
      return [first.bestMove.move, second.bestMove.move];
    });

    expect(moves).toEqual(["e2e4", "g1f3"]);
    expect(engines).toHaveLength(3);
  });

  it("rearms the silence watchdog on every info line, so a slow search is not killed", async () => {
    // Four info lines spaced just under the silence timeout: a total
    // deadline would fire partway through, a rearmed one never does.
    const { engines, open } = sessions(() => ({
      handshake: true,
      onCommand: (command, emit) => {
        if (!command.startsWith("go")) return;
        void (async () => {
          for (let depth = 1; depth <= 4; depth++) {
            await new Promise((resolve) => setTimeout(resolve, 20));
            emit(`info depth ${depth} multipv 1 score cp ${depth} pv e2e4`);
          }
          emit("bestmove e2e4");
        })();
      },
    }));

    const search = await run(function* () {
      const evaluator = yield* useEngineEvaluator(open, {
        depth: 8,
        silenceTimeoutMs: 60,
      });
      return yield* evaluator.evaluate("fen-a");
    });

    expect(search.bestMove).toEqual({ move: "e2e4" });
    expect(search.lastInfo?.depth).toBe(4);
    expect(engines).toHaveLength(1);
    expect(engines[0]!.sent).not.toContain("stop");
  });
});

describe("useEngineEvaluator cancellation", () => {
  it("halting mid-evaluate tears the session down", async () => {
    const { engines, open } = sessions(() => MUTE);

    await run(function* () {
      const task = yield* spawn(function* () {
        const evaluator = yield* useEngineEvaluator(open, {
          depth: 8,
          silenceTimeoutMs: 10_000,
        });
        yield* evaluator.evaluate("fen-a");
      });

      yield* flushUntil(
        () => engines[0]?.sent.includes("go depth 8") ?? false,
        "the search to start",
      );
      expect(engines[0]!.closed).toBe(false);

      yield* task.halt();
      expect(engines[0]!.closed).toBe(true);
    });
  });
});

describe("useEngineEvaluator initialisation failure", () => {
  it("surfaces the original error instead of hanging", async () => {
    const boom = new Error("this browser can't run the engine");

    await expect(
      run(function* () {
        yield* useEngineEvaluator(
          () =>
            call((): never => {
              throw boom;
            }),
          FAST,
        );
      }),
    ).rejects.toBe(boom);
  });

  it("releases a transport that opened before the handshake failed", async () => {
    const engine = createFakeEngine();

    await expect(
      run(function* () {
        yield* useEngineEvaluator(
          () => useEngineSession(engine.open, { handshakeTimeoutMs: 20 }),
          FAST,
        );
      }),
    ).rejects.toThrow(/handshake timed out/);

    expect(engine.closed).toBe(true);
  });
});
