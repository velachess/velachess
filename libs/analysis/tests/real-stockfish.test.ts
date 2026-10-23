// @vitest-environment node
import { createRequire } from "node:module";

import { parseFen, parsePgn, replayMainline } from "@velachess/chess";
import {
  useEngineEvaluator,
  useEngineSession,
  type EngineEvaluator,
  type EngineSession,
} from "@velachess/infra-engine";
import { useChildProcessTransport } from "@velachess/infra-engine/child-process-transport";
import { run, type Operation } from "effection";
import { describe, expect, it } from "vitest";

import { classifyPly, terminalScoreOf, type GradedPly } from "../grade-game.ts";
import { toWhitePov, type PositionEvaluation } from "../score.ts";

const FOOLS_MATE = "1. f3 e5 2. g4 Qh4# *";

const require = createRequire(import.meta.url);
const enginePath = require.resolve("stockfish/bin/stockfish-19-lite-single.js");

function openStockfish(): Operation<EngineSession> {
  return useEngineSession(() => useChildProcessTransport(process.execPath, [enginePath]));
}

/** The engine's own answer in this module's vocabulary. The search is
 * `@velachess/infra-engine`'s business; the white-POV conversion is the
 * policy under test. */
function* evaluate(engine: EngineEvaluator, fen: string): Operation<PositionEvaluation> {
  const search = yield* engine.evaluate(fen);
  return {
    score: search.lastInfo
      ? toWhitePov(search.lastInfo.score, parseFen(fen).unwrap().turn)
      : {},
    bestMove: search.bestMove.move === "(none)" ? null : search.bestMove.move,
  };
}

describe("grading real Stockfish scores", () => {
  it("reads the losing blunder and the mate the rules scored, in white POV", async () => {
    const replay = replayMainline(parsePgn(FOOLS_MATE)[0]!).unwrap();

    const graded = await run(function* (): Operation<GradedPly[]> {
      const engine = yield* useEngineEvaluator(openStockfish, { depth: 8 });

      const decided: GradedPly[] = [];
      let current = yield* evaluate(engine, replay.moves[0]!.fenBefore);

      for (const [index, played] of replay.moves.entries()) {
        const endsHere = index === replay.moves.length - 1 && replay.terminal;
        const next: PositionEvaluation = endsHere
          ? { score: terminalScoreOf(replay.terminal!), bestMove: null }
          : yield* evaluate(engine, played.fenAfter);

        decided.push(classifyPly(index + 1, played, current, next));
        current = next;
      }
      return decided;
    });

    expect(graded.map((position) => position.ply)).toEqual([1, 2, 3, 4]);

    // 2. g4 (ply 3) allows mate in one — the eval after it must be a
    // black mate, white POV.
    const g4 = graded[2]!;
    expect(g4.evalAfter.mate).toBeLessThan(0);
    expect(g4.category).toBe("blunder");

    // Qh4# (ply 4) ends the game: its eval comes from the rules, not a
    // search, and mating was what the engine wanted played.
    const qh4 = graded[3]!;
    expect(qh4.evalAfter).toEqual({ mate: -1 });
    expect(qh4.category).toBe("best");
  }, 30_000);
});
