import { describe, expect, it } from "vitest";

import type { PositionEvaluation } from "@velachess/analysis";
import type { EngineUpdate } from "@velachess/infra-engine";

import { aReplay } from "../../../test/games.ts";
import { analyzeGame } from "../game/analyze.ts";
import type { PositionEvaluator } from "../position/evaluate.ts";
import { ANALYSIS_EVENT, type AnalysisEvent } from "../types.ts";

/** "1. f3 e5 2. g4 Qh4#" — the game ends on its last move, so the rules
 * score that position and the engine is never asked about it. */
const FOOLS_MATE = "1. f3 e5 2. g4 Qh4# *";

const LEVEL: PositionEvaluation = { score: { cp: 0 }, bestMove: "e2e4" };

interface FakeEvaluator extends PositionEvaluator {
  /** Every position it was asked about, in the order it was asked. */
  readonly asked: readonly string[];
  readonly disposed: boolean;
}

function fakeEvaluator(
  answerOf: (fen: string) => PositionEvaluation = () => LEVEL,
  updatesOf: (fen: string) => readonly EngineUpdate[] = () => [],
): FakeEvaluator {
  const asked: string[] = [];
  let disposed = false;

  return {
    asked,
    get disposed() {
      return disposed;
    },
    evaluate(fen: string) {
      asked.push(fen);

      async function* search() {
        for (const update of updatesOf(fen)) yield update;
        return answerOf(fen);
      }

      return Object.assign(search(), { cancel: () => {} });
    },
    dispose: async () => {
      disposed = true;
    },
  };
}

function anUpdate(depth: number): EngineUpdate {
  return { depth, multipv: 1, score: { cp: 12 }, pv: ["e2e4"] };
}

async function collect(events: AsyncGenerator<AnalysisEvent>): Promise<AnalysisEvent[]> {
  const seen: AnalysisEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

function gradedPlies(events: readonly AnalysisEvent[]): number[] {
  return events.flatMap((event) =>
    event.type === ANALYSIS_EVENT.PLY_GRADED ? [event.grade.ply] : [],
  );
}

describe("analyzeGame", () => {
  it("asks for the position before the first move, then the one after each move", async () => {
    const replay = aReplay("1. e4 e5 *");
    const evaluator = fakeEvaluator();

    await collect(analyzeGame(replay, evaluator));

    expect(evaluator.asked).toEqual([
      replay.moves[0]!.fenBefore,
      replay.moves[0]!.fenAfter,
      replay.moves[1]!.fenAfter,
    ]);
  });

  it("takes a terminal position's score from the rules instead of searching it", async () => {
    const replay = aReplay(FOOLS_MATE);
    const evaluator = fakeEvaluator();

    const events = await collect(analyzeGame(replay, evaluator));

    expect(evaluator.asked).not.toContain(replay.moves[3]!.fenAfter);
    expect(evaluator.asked).toHaveLength(replay.moves.length);
    expect(gradedPlies(events)).toEqual([1, 2, 3, 4]);

    const mate = events.find(
      (event) => event.type === ANALYSIS_EVENT.PLY_GRADED && event.grade.ply === 4,
    );
    expect(mate).toEqual({
      type: ANALYSIS_EVENT.PLY_GRADED,
      grade: expect.objectContaining({ evalAfter: { mate: -1 } }),
    });
  });

  it("grades each ply from the evaluation before it and the one after it, searching each position once", async () => {
    const replay = aReplay("1. e4 e5 *");
    const answers = new Map<string, PositionEvaluation>([
      [replay.moves[0]!.fenBefore, { score: { cp: 20 }, bestMove: "e2e4" }],
      [replay.moves[0]!.fenAfter, { score: { cp: -300 }, bestMove: "d7d5" }],
      [replay.moves[1]!.fenAfter, { score: { cp: 10 }, bestMove: "g1f3" }],
    ]);
    const evaluator = fakeEvaluator((fen) => answers.get(fen)!);

    const events = await collect(analyzeGame(replay, evaluator));

    // Three searches for two plies: the evaluation after a move is the
    // evaluation before the next one.
    expect(evaluator.asked).toHaveLength(3);
    expect(events.filter((event) => event.type === ANALYSIS_EVENT.PLY_GRADED)).toEqual([
      {
        type: ANALYSIS_EVENT.PLY_GRADED,
        grade: {
          ply: 1,
          evalBefore: { cp: 20 },
          evalAfter: { cp: -300 },
          bestMove: "e2e4",
          category: "best",
          winChanceLoss: expect.closeTo(0.539055, 6),
        },
      },
      {
        type: ANALYSIS_EVENT.PLY_GRADED,
        grade: {
          ply: 2,
          evalBefore: { cp: -300 },
          evalAfter: { cp: 10 },
          bestMove: "d7d5",
          category: "blunder",
          winChanceLoss: expect.closeTo(0.520659, 6),
        },
      },
    ]);
  });

  it("reports the search in progress, naming the ply it will grade", async () => {
    const replay = aReplay("1. e4 e5 *");
    const evaluator = fakeEvaluator(
      () => LEVEL,
      () => [anUpdate(5), anUpdate(6)],
    );

    const events = await collect(analyzeGame(replay, evaluator));

    expect(events[0]).toEqual({
      type: ANALYSIS_EVENT.POSITION_UPDATE,
      live: { ply: 1, fen: replay.moves[0]!.fenBefore, update: anUpdate(5) },
    });
    // Every grade arrives after the updates of the search that decided
    // it, so nothing is ever graded from a provisional score.
    expect(events.map((event) => event.type)).toEqual([
      ANALYSIS_EVENT.POSITION_UPDATE,
      ANALYSIS_EVENT.POSITION_UPDATE,
      ANALYSIS_EVENT.POSITION_UPDATE,
      ANALYSIS_EVENT.POSITION_UPDATE,
      ANALYSIS_EVENT.PLY_GRADED,
      ANALYSIS_EVENT.POSITION_UPDATE,
      ANALYSIS_EVENT.POSITION_UPDATE,
      ANALYSIS_EVENT.PLY_GRADED,
      ANALYSIS_EVENT.COMPLETED,
    ]);
  });

  it("ends with every grade it produced", async () => {
    const events = await collect(analyzeGame(aReplay("1. e4 e5 *"), fakeEvaluator()));

    expect(events.at(-1)).toEqual({
      type: ANALYSIS_EVENT.COMPLETED,
      graded: [expect.objectContaining({ ply: 1 }), expect.objectContaining({ ply: 2 })],
    });
  });

  it("completes with nothing for a game with no moves, without searching", async () => {
    const evaluator = fakeEvaluator();

    const events = await collect(analyzeGame(aReplay("*"), evaluator));

    expect(events).toEqual([{ type: ANALYSIS_EVENT.COMPLETED, graded: [] }]);
    expect(evaluator.asked).toEqual([]);
  });

  it("grades the legal prefix of a game that goes illegal part-way", async () => {
    // Same policy the import applies: a game with at least one legal move
    // is a game, and the part that replayed is what the board shows.
    const events = await collect(
      analyzeGame(aReplay("1. e4 e5 2. Qxf7# *"), fakeEvaluator()),
    );

    expect(gradedPlies(events)).toEqual([1, 2]);
  });

  it("fails the game rather than completing a half-graded one", async () => {
    const boom = new Error("Engine failed twice evaluating something");
    const replay = aReplay("1. e4 e5 *");
    const evaluator = fakeEvaluator((fen) => {
      if (fen === replay.moves[1]!.fenAfter) throw boom;
      return LEVEL;
    });

    const seen: AnalysisEvent[] = [];
    await expect(
      (async () => {
        for await (const event of analyzeGame(replay, evaluator)) seen.push(event);
      })(),
    ).rejects.toBe(boom);

    expect(gradedPlies(seen)).toEqual([1]);
    expect(seen.some((event) => event.type === ANALYSIS_EVENT.COMPLETED)).toBe(false);
  });
});
