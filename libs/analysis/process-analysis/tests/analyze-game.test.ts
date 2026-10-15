// @vitest-environment node
import { createRequire } from "node:module";

import { parsePgn, replayMainline } from "@velachess/chess";
import { EngineSession, type Transport } from "@velachess/infra-engine";
import { ChildProcessTransport } from "@velachess/infra-engine/transport-child-process";
import { describe, expect, it } from "vitest";

import type { StoredGradedPly } from "@velachess/infra-db";

import {
  analyzeGame,
  evaluatePositions,
  fensToEvaluate,
  gradeGame,
  type AnalysisEvent,
  type GradedPly,
} from "../analyze-game.ts";

// Drift guard: infra-db stores a report as jsonb and declares its own
// structural mirror of GradedPly, because drizzle-kit's schema loader must
// never pull in the chess toolchain. The two must stay mutually
// assignable, checked at typecheck time in both directions.
//
// It lives here, not in infra-db's own tests, because this is the
// direction the package graph already runs: analysis depends on infra-db.
// The reverse made @velachess/analysis a devDependency of infra-db, which
// turned the graph into a cycle and made every analysis-only change mark
// infra-db — and everything downstream of it — affected.
const toStoredDriftCheck: StoredGradedPly = {} as GradedPly;
const fromStoredDriftCheck: GradedPly = {} as StoredGradedPly;
void toStoredDriftCheck;
void fromStoredDriftCheck;

const require = createRequire(import.meta.url);
const enginePath = require.resolve("stockfish/bin/stockfish-19-lite-single.js");

async function makeStockfishSession(): Promise<EngineSession> {
  const session = new EngineSession(
    new ChildProcessTransport(process.execPath, [enginePath]),
  );
  await session.init();
  return session;
}

const FOOLS_MATE = "1. f3 e5 2. g4 Qh4# *";

async function collect(events: AsyncIterable<AnalysisEvent>) {
  const positions = [];
  let done;
  for await (const event of events) {
    if (event.type === "position") positions.push(event);
    else done = event;
  }
  return { positions, done };
}

describe("analyzeGame (real Stockfish)", () => {
  it("streams one event per ply, then done, with white-POV evals and the losing blunder flagged", async () => {
    const game = parsePgn(FOOLS_MATE)[0]!;
    const { positions, done } = await collect(
      analyzeGame(game, makeStockfishSession, { depth: 8 }),
    );

    expect(positions).toHaveLength(4);
    expect(positions.map((e) => e.index)).toEqual([0, 1, 2, 3]);
    expect(positions.every((e) => e.total === 4)).toBe(true);
    expect(done?.positions).toHaveLength(4);

    // 3. g4 allows mate in one — the eval after it must be a black mate, white POV.
    const g4 = done!.positions[2]!;
    expect(g4.san).toBe("g4");
    expect(g4.evalAfter.mate).toBeLessThan(0);
    expect(g4.category).toBe("blunder");

    // Final position is checkmate: terminal eval, no search.
    const qh4 = done!.positions[3]!;
    expect(qh4.san).toBe("Qh4#");
    expect(qh4.evalAfter).toEqual({ mate: -1 });
  });

  it("a watchdog timeout followed by a live engine reply continues instead of failing", async () => {
    const game = parsePgn("1. e4 e5 *")[0]!;
    const { positions } = await collect(
      analyzeGame(game, makeStockfishSession, { depth: 10, searchTimeoutMs: 1 }),
    );
    expect(positions).toHaveLength(2);
  });
});

describe("analyzeGame failure policy", () => {
  class MuteTransport implements Transport {
    readonly sent: string[] = [];
    send(command: string): void {
      this.sent.push(command);
    }
    // Never emits and never ends: the watchdog is what must react.
    // Written as a plain method rather than `async *` because a generator
    // with no yield is a lint error and, more to the point, a lie about
    // what this does.
    lines(): AsyncIterable<string> {
      return {
        [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}) }),
      };
    }
    close(): void {}
  }

  it("retries once on a dead engine, then fails the game", async () => {
    let sessions = 0;
    const makeMuteSession = async () => {
      sessions++;
      return new EngineSession(new MuteTransport());
    };

    const game = parsePgn("1. e4 e5 *")[0]!;
    await expect(
      collect(analyzeGame(game, makeMuteSession, { depth: 8, searchTimeoutMs: 50 })),
    ).rejects.toThrow(/failed twice/);
    expect(sessions).toBe(2);
  }, 15_000);
});

describe("analyzeGame retry budget", () => {
  class FlakyTransport implements Transport {
    private readonly queue: string[] = [];
    private waiting: ((line: string) => void) | null = null;

    constructor(
      private readonly goCalls: { count: number },
      private readonly failOnGoCalls: ReadonlySet<number>,
    ) {}

    send(command: string): void {
      if (!command.startsWith("go")) return;
      this.goCalls.count++;
      if (this.failOnGoCalls.has(this.goCalls.count)) return;
      this.push("info depth 1 multipv 1 score cp 0 pv e2e4");
      this.push("bestmove e2e4");
    }

    private push(line: string): void {
      if (this.waiting) {
        const resolve = this.waiting;
        this.waiting = null;
        resolve(line);
      } else {
        this.queue.push(line);
      }
    }

    async *lines(): AsyncIterable<string> {
      while (true) {
        const queued = this.queue.shift();
        if (queued !== undefined) {
          yield queued;
          continue;
        }
        yield await new Promise<string>((resolve) => {
          this.waiting = resolve;
        });
      }
    }

    close(): void {}
  }

  it("retries each failing position independently, not just the first one in the game", async () => {
    const goCalls = { count: 0 };
    const failOnGoCalls = new Set([1, 3]);
    let sessions = 0;
    const makeFlakySession = async () => {
      sessions++;
      return new EngineSession(new FlakyTransport(goCalls, failOnGoCalls));
    };

    // 2 plies need 3 searches (before e4, after e4, after e5). Go-calls #1
    // (before e4) and #3 (after e4) each fail once — a global retry flag
    // would let the first recover but abort the game on the second.
    const game = parsePgn("1. e4 e5 *")[0]!;
    const { positions, done } = await collect(
      analyzeGame(game, makeFlakySession, { depth: 8, searchTimeoutMs: 50 }),
    );

    expect(positions).toHaveLength(2);
    expect(done?.positions).toHaveLength(2);
    expect(sessions).toBe(3);
  }, 15_000);
});

describe("fensToEvaluate", () => {
  it("includes the position after the final move when the game didn't end there", () => {
    const game = parsePgn("1. e4 e5 *")[0]!;
    const replay = replayMainline(game).unwrap();

    expect(fensToEvaluate(replay)).toEqual([
      replay.moves[0]!.fenBefore,
      replay.moves[0]!.fenAfter,
      replay.moves[1]!.fenAfter,
    ]);
  });

  it("drops the final move's own position when it ends the game — the rules score it, not a search", () => {
    const game = parsePgn(FOOLS_MATE)[0]!;
    const replay = replayMainline(game).unwrap();

    expect(fensToEvaluate(replay)).toEqual([
      replay.moves[0]!.fenBefore,
      replay.moves[0]!.fenAfter,
      replay.moves[1]!.fenAfter,
      replay.moves[2]!.fenAfter,
    ]);
    expect(fensToEvaluate(replay)).not.toContain(replay.moves[3]!.fenAfter);
  });

  it("returns nothing for a game with no moves", () => {
    const game = parsePgn("*")[0]!;
    const replay = replayMainline(game).unwrap();

    expect(fensToEvaluate(replay)).toEqual([]);
  });
});

function makeSpyCache(
  prefilled: Map<string, { score: { cp: number }; bestMove: string }>,
) {
  const puts: string[] = [];
  return {
    cache: {
      get: (fen: string) => prefilled.get(fen) ?? null,
      put: (fen: string, raw: { score: { cp: number }; bestMove: string | null }) => {
        puts.push(fen);
        prefilled.set(fen, { score: raw.score, bestMove: raw.bestMove ?? "" });
      },
    },
    puts,
  };
}

describe("AnalyzeOptions.cache", () => {
  class AutoAnswerTransport implements Transport {
    private readonly queue: string[] = [];
    private waiting: ((line: string) => void) | null = null;

    constructor(private readonly goCalls: { count: number }) {}

    send(command: string): void {
      if (!command.startsWith("go")) return;
      this.goCalls.count++;
      this.push("info depth 1 multipv 1 score cp 0 pv e2e4");
      this.push("bestmove e2e4");
    }

    private push(line: string): void {
      if (this.waiting) {
        const resolve = this.waiting;
        this.waiting = null;
        resolve(line);
      } else {
        this.queue.push(line);
      }
    }

    async *lines(): AsyncIterable<string> {
      while (true) {
        const queued = this.queue.shift();
        if (queued !== undefined) {
          yield queued;
          continue;
        }
        yield await new Promise<string>((resolve) => {
          this.waiting = resolve;
        });
      }
    }

    close(): void {}
  }

  it("skips the engine for a cached position and still writes a miss through", async () => {
    const game = parsePgn("1. e4 e5 *")[0]!;
    const replay = replayMainline(game).unwrap();
    const fens = fensToEvaluate(replay);
    const cachedFen = fens[1]!;
    const cachedEval = { score: { cp: 999 }, bestMove: "g1f3" };

    const goCalls = { count: 0 };
    const { cache, puts } = makeSpyCache(new Map([[cachedFen, cachedEval]]));
    const makeSession = async () => new EngineSession(new AutoAnswerTransport(goCalls));

    const evals = await evaluatePositions(fens, makeSession, { depth: 8, cache });

    // 3 positions, 1 already cached — only the other 2 ever reach the engine.
    expect(goCalls.count).toBe(2);
    expect(evals[1]).toEqual(cachedEval);
    expect(puts).toEqual([fens[0], fens[2]]);
  });
});

describe("evaluatePositions + gradeGame parity", () => {
  it("produces, in sequence, the exact same positions analyzeGame streams for the same input", async () => {
    const game = parsePgn(FOOLS_MATE)[0]!;
    const replay = replayMainline(game).unwrap();

    const evals = await evaluatePositions(fensToEvaluate(replay), makeStockfishSession, {
      depth: 8,
    });
    const split = gradeGame(replay.moves, replay.finalPosition, evals);

    const { done } = await collect(analyzeGame(game, makeStockfishSession, { depth: 8 }));

    expect(split).toEqual(done?.positions);
  });
});
