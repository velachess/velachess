// @vitest-environment node
import { createRequire } from "node:module";

import { parsePgn, replayMainline } from "@velachess/chess";
import {
  useEngineEvaluator,
  useEngineSession,
  type EngineSession,
} from "@velachess/infra-engine";
import { useChildProcessTransport } from "@velachess/infra-engine/child-process-transport";
import { call, run, type Operation } from "effection";
import { describe, expect, it } from "vitest";

import { analyzeGame, fensToEvaluate, type PositionEvaluator } from "../analyze-game.ts";
import type { GradedPly } from "../grade-game.ts";
import { toWhitePov, type PositionEvaluation } from "../score.ts";

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
  yield* analyzeGame(
    replayMainline(parsePgn(pgn)[0]!).unwrap(),
    evaluator,
    (position) => {
      published.push(position);
    },
  );
  return published;
}

describe("analyzeGame (real Stockfish)", () => {
  it("streams one event per ply, then done, with white-POV evals and the losing blunder flagged", async () => {
    const published = await run(function* () {
      const evaluator = yield* useStockfishEvaluator(8);
      return yield* collect(evaluator, FOOLS_MATE);
    });

    expect(published.map((position) => position.ply)).toEqual([1, 2, 3, 4]);

    // 2. g4 (ply 3) allows mate in one — the eval after it must be a
    // black mate, white POV.
    const g4 = published[2]!;
    expect(g4.evalAfter.mate).toBeLessThan(0);
    expect(g4.category).toBe("blunder");

    // Qh4# (ply 4) ends the game: its eval comes from the rules, not a
    // search, and mating was what the engine wanted played.
    const qh4 = published[3]!;
    expect(qh4.evalAfter).toEqual({ mate: -1 });
    expect(qh4.category).toBe("best");
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

  it("credits a castle the engine also chose", async () => {
    // chessops encodes castling as king-takes-own-rook (e1h1); an engine
    // names the king's step (e1g1). If the replay carried the former, no
    // castle could ever be the engine's move.
    const pgn =
      '[Event "C"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]\n[SetUp "1"]\n\n1. O-O *\n';
    const replay = replayMainline(parsePgn(pgn)[0]!).unwrap();
    expect(replay.moves[0]?.uci).toBe("e1g1");

    const published = await run(function* () {
      return yield* collect(
        { evaluate: () => call(() => ({ score: { cp: 0 }, bestMove: "e1g1" })) },
        pgn,
      );
    });

    expect(published[0]?.category).toBe("best");
  });

  it("grades the legal prefix of a game that goes illegal part-way", async () => {
    // Same policy the import applies: a game with at least one legal move
    // is a game, and the part that replayed is what the board shows.
    const published = await run(function* () {
      return yield* collect(stubEvaluator(), "1. e4 e5 2. Qxf7# *");
    });

    expect(published.map((position) => position.ply)).toEqual([1, 2]);
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
function stubEvaluator(
  score: PositionEvaluation = { score: { cp: 0 }, bestMove: "e2e4" },
) {
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

  it("grades each ply from the evaluation before it and the one after it", async () => {
    const evals: PositionEvaluation[] = [
      { score: { cp: 20 }, bestMove: "e2e4" },
      { score: { cp: -300 }, bestMove: "d7d5" },
      { score: { cp: 10 }, bestMove: "g1f3" },
    ];
    const recorded = new Map<string, PositionEvaluation>();
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

    expect(published).toEqual([
      {
        ply: 1,
        evalBefore: { cp: 20 },
        evalAfter: { cp: -300 },
        bestMove: "e2e4",
        // The engine's own move is `best` however much the eval then
        // drops; the loss is still reported.
        category: "best",
        winChanceLoss: expect.closeTo(0.539055, 6),
      },
      {
        ply: 2,
        evalBefore: { cp: -300 },
        evalAfter: { cp: 10 },
        bestMove: "d7d5",
        category: "blunder",
        winChanceLoss: expect.closeTo(0.520659, 6),
      },
    ]);
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
