// @vitest-environment node
import { createRequire } from "node:module";

import { parsePgn, replayMainline } from "@velachess/chess";
import type { StoredGradedPly } from "@velachess/infra-db";
import {
  useEngineEvaluator,
  useEngineSession,
  type EngineSession,
} from "@velachess/infra-engine";
import { useChildProcessTransport } from "@velachess/infra-engine/child-process-transport";
import { call, run, type Operation } from "effection";
import { describe, expect, it } from "vitest";

import { analyzeGame, fensToEvaluate, type PositionEvaluator } from "../analyze-game.ts";
import { gradeGame, type GradedPly } from "../grade-game.ts";
import { toWhitePov, type RawEval } from "../score.ts";

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

const FOOLS_MATE = "1. f3 e5 2. g4 Qh4# *";

const require = createRequire(import.meta.url);
const enginePath = require.resolve("stockfish/bin/stockfish-19-lite-single.js");

function openStockfish(): Operation<EngineSession> {
  return useEngineSession(() => useChildProcessTransport(process.execPath, [enginePath]));
}

/** A real engine behind this module's one declared dependency: the search
 * is `@velachess/infra-engine`'s business, the white-POV conversion is
 * this module's. */
function* useStockfishEvaluator(depth: number): Operation<PositionEvaluator> {
  const engine = yield* useEngineEvaluator(openStockfish, { depth });
  return {
    *evaluate(fen: string) {
      const search = yield* engine.evaluate(fen);
      const pov = fen.includes(" w ") ? "white" : "black";
      return {
        score: search.lastInfo ? toWhitePov(search.lastInfo.score, pov) : {},
        bestMove: search.bestMove.move === "(none)" ? null : search.bestMove.move,
      };
    },
  };
}

/** Everything `analyzeGame` published, in the order it arrived. */
function* collect(evaluator: PositionEvaluator, pgn: string): Operation<GradedPly[]> {
  const published: GradedPly[] = [];
  yield* analyzeGame(parsePgn(pgn)[0]!, evaluator, (position) => {
    published.push(position);
  });
  return published;
}

describe("analyzeGame (real Stockfish)", () => {
  it("streams one event per ply, then done, with white-POV evals and the losing blunder flagged", async () => {
    const published = await run(function* () {
      const evaluator = yield* useStockfishEvaluator(8);
      return yield* collect(evaluator, FOOLS_MATE);
    });

    expect(published.map((position) => position.ply)).toEqual([1, 2, 3, 4]);

    // 2. g4 allows mate in one — the eval after it must be a black mate, white POV.
    const g4 = published[2]!;
    expect(g4.san).toBe("g4");
    expect(g4.evalAfter.mate).toBeLessThan(0);
    expect(g4.category).toBe("blunder");

    // Final position is checkmate: terminal eval, no search.
    const qh4 = published[3]!;
    expect(qh4.san).toBe("Qh4#");
    expect(qh4.evalAfter).toEqual({ mate: -1 });
  }, 30_000);

  it("a failing engine fails the game rather than reporting a half-graded one", async () => {
    const boom = new Error("Engine failed twice evaluating something");

    await expect(
      run(function* () {
        yield* collect(
          {
            evaluate: () =>
              call((): never => {
                throw boom;
              }),
          },
          "1. e4 e5 *",
        );
      }),
    ).rejects.toBe(boom);
  });

  it("rejects a game whose mainline is not legal", async () => {
    await expect(
      run(function* () {
        yield* collect(stubEvaluator(), "1. e4 e5 2. Qxf7# *");
      }),
    ).rejects.toThrow(/illegal move/);
  });

  it("publishes nothing for a game with no moves", async () => {
    const published = await run(function* () {
      return yield* collect(stubEvaluator(), "*");
    });

    expect(published).toEqual([]);
  });
});

/** Answers every position identically — enough for the sequencing and
 * classification assertions that don't care what the score is. */
function stubEvaluator(score: RawEval = { score: { cp: 0 }, bestMove: "e2e4" }) {
  const asked: string[] = [];
  return {
    asked,
    evaluate: (fen: string) =>
      call(() => {
        asked.push(fen);
        return score;
      }),
  };
}

describe("analyzeGame sequencing", () => {
  it("asks for exactly the FENs fensToEvaluate names, in that order", async () => {
    const evaluator = stubEvaluator();
    const replay = replayMainline(parsePgn(FOOLS_MATE)[0]!).unwrap();

    await run(function* () {
      yield* collect(evaluator, FOOLS_MATE);
    });

    expect(evaluator.asked).toEqual(fensToEvaluate(replay));
  });

  it("publishes exactly what gradeGame produces for the same evaluations", async () => {
    const evals: RawEval[] = [
      { score: { cp: 20 }, bestMove: "e2e4" },
      { score: { cp: -300 }, bestMove: "d7d5" },
      { score: { cp: 10 }, bestMove: "g1f3" },
    ];
    const recorded = new Map<string, RawEval>();
    const replay = replayMainline(parsePgn("1. e4 e5 *")[0]!).unwrap();
    fensToEvaluate(replay).forEach((fen, index) => recorded.set(fen, evals[index]!));

    const published = await run(function* () {
      return yield* collect(
        {
          evaluate: (fen: string) => call(() => recorded.get(fen)!),
        },
        "1. e4 e5 *",
      );
    });

    expect(published).toEqual(gradeGame(replay.moves, replay.finalPosition, evals));
  });
});

describe("fensToEvaluate", () => {
  it("includes the position after the final move when the game didn't end there", () => {
    const replay = replayMainline(parsePgn("1. e4 e5 *")[0]!).unwrap();

    expect(fensToEvaluate(replay)).toEqual([
      replay.moves[0]!.fenBefore,
      replay.moves[0]!.fenAfter,
      replay.moves[1]!.fenAfter,
    ]);
  });

  it("drops the final move's own position when it ends the game — the rules score it, not a search", () => {
    const replay = replayMainline(parsePgn(FOOLS_MATE)[0]!).unwrap();

    expect(fensToEvaluate(replay)).toEqual([
      replay.moves[0]!.fenBefore,
      replay.moves[0]!.fenAfter,
      replay.moves[1]!.fenAfter,
      replay.moves[2]!.fenAfter,
    ]);
    expect(fensToEvaluate(replay)).not.toContain(replay.moves[3]!.fenAfter);
  });

  it("returns nothing for a game with no moves", () => {
    const replay = replayMainline(parsePgn("*")[0]!).unwrap();

    expect(fensToEvaluate(replay)).toEqual([]);
  });
});
