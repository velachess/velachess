import { createRequire } from "node:module";

import { FOOLS_MATE_CHECKMATE, STARTING_POSITION } from "@velachess/fixtures";
import { each, run, type Operation } from "effection";
import { describe, expect, it } from "vitest";

import { useEngineEvaluator } from "../engine-evaluator.ts";
import { useEngineSession, type EngineSession } from "../engine-session.ts";
import { useChildProcessTransport } from "../child-process-transport.ts";
import type { EngineUpdate, GoMode, SearchOutcome } from "../types.ts";

// e2e: talks to a real Stockfish process (the `stockfish` npm package ships
// a UCI engine runnable straight under node, no native binary required).
// One session per test, which is also how a real consumer gets one — the
// evaluator owns a session and replaces it when the engine dies.

const require = createRequire(import.meta.url);
const enginePath = require.resolve("stockfish/bin/stockfish-19-lite-single.js");

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function openStockfish(): Operation<EngineSession> {
  return useEngineSession(() => useChildProcessTransport(process.execPath, [enginePath]));
}

function* drain(
  session: EngineSession,
  mode: GoMode,
): Operation<{ updates: EngineUpdate[]; outcome: SearchOutcome }> {
  const search = yield* session.search(mode);
  const updates: EngineUpdate[] = [];
  while (true) {
    const next = yield* search.next();
    if (next.done) return { updates, outcome: next.value };
    updates.push(next.value);
  }
}

describe("EngineSession (real Stockfish process)", () => {
  it("streams increasing-depth updates and settles on a legal bestmove", async () => {
    const { updates, outcome } = await run(function* () {
      const session = yield* openStockfish();
      session.setPosition(STARTING_POSITION);
      return yield* drain(session, { kind: "depth", depth: 8 });
    });

    expect(updates.length).toBeGreaterThan(0);
    expect(updates.at(-1)?.depth).toBe(8);
    expect(
      updates.every(
        (update) =>
          typeof update.score.cp === "number" || typeof update.score.mate === "number",
      ),
    ).toBe(true);
    expect(outcome.bestMove?.move).toMatch(UCI_MOVE);
    expect(outcome.lastInfo?.depth).toBe(8);
  }, 20_000);

  it("reports no legal move in a checkmate position", async () => {
    const outcome = await run(function* () {
      const session = yield* openStockfish();
      session.setPosition(FOOLS_MATE_CHECKMATE);
      const { outcome: settled } = yield* drain(session, { kind: "depth", depth: 5 });
      return settled;
    });

    expect(outcome.bestMove).toEqual({ move: "(none)" });
  }, 20_000);

  it("stop() ends an in-flight infinite search and still settles", async () => {
    const outcome = await run(function* () {
      const session = yield* openStockfish();
      session.setPosition(STARTING_POSITION);
      const search = yield* session.search({ kind: "infinite" });

      // Let one update come in, then cut it short.
      yield* search.next();
      session.stop();

      while (true) {
        const next = yield* search.next();
        if (next.done) return next.value;
      }
    });

    expect(outcome.bestMove?.move).toMatch(UCI_MOVE);
  }, 20_000);

  it("reports multiple simultaneous lines when MultiPV > 1", async () => {
    const updates = await run(function* () {
      const session = yield* openStockfish();
      session.setOption({ name: "MultiPV", value: 3 });
      session.setPosition(STARTING_POSITION);
      const { updates: seen } = yield* drain(session, { kind: "depth", depth: 6 });
      return seen;
    });

    expect(new Set(updates.map((update) => update.multipv))).toEqual(new Set([1, 2, 3]));
  }, 20_000);

  it("each() is enough to walk a real search to its outcome", async () => {
    const depths = await run(function* () {
      const session = yield* openStockfish();
      session.setPosition(STARTING_POSITION);
      const seen: number[] = [];
      for (const update of yield* each(
        yield* session.search({ kind: "depth", depth: 6 }),
      )) {
        seen.push(update.depth);
        yield* each.next();
      }
      return seen;
    });

    expect(depths.at(-1)).toBe(6);
  }, 20_000);
});

describe("EngineEvaluator (real Stockfish process)", () => {
  it("evaluates a position through the reliability layer, one session for many searches", async () => {
    const searches = await run(function* () {
      const evaluator = yield* useEngineEvaluator(openStockfish, { depth: 8 });
      const opening = yield* evaluator.evaluate(STARTING_POSITION);
      const mated = yield* evaluator.evaluate(FOOLS_MATE_CHECKMATE);
      return { opening, mated };
    });

    expect(searches.opening.bestMove.move).toMatch(UCI_MOVE);
    expect(searches.opening.lastInfo?.score.cp).toBeTypeOf("number");
    expect(searches.mated.bestMove).toEqual({ move: "(none)" });
  }, 30_000);
});
