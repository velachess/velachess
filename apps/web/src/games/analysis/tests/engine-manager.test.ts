import { call, ensure, run, withResolvers, type Operation } from "effection";
import { describe, expect, it, vi } from "vitest";

import type { GradedPly, RawEval } from "@velachess/analysis";

vi.mock("../game/analyze-game-in-browser.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));
vi.mock("../position/evaluate-position-in-browser.ts", () => ({
  evaluatePositionInBrowser: vi.fn(),
}));

import { aGradedPly } from "../../../test/games.ts";
import {
  analyzeGameInBrowser,
  type GameAnalysisInput,
} from "../game/analyze-game-in-browser.ts";
import { evaluatePositionInBrowser } from "../position/evaluate-position-in-browser.ts";
import {
  createEngineManager,
  EnginePreempted,
  type EngineManager,
} from "../engine-manager.ts";

const A_RAW_EVAL: RawEval = { score: { cp: 10 }, bestMove: "e2e4" };

const GAME: GameAnalysisInput = { gameId: "game-a", rawPgn: "pgn-a", depth: 14 };
const POSITION = { fen: "fen-a", depth: 14 };

/**
 * Counts how many bodies are inside the engine at once. Every test leans
 * on this: the manager's whole job is that the answer is never 2.
 */
function createWitness() {
  let inside = 0;
  let peak = 0;
  let teardowns = 0;
  return {
    get peak() {
      return peak;
    },
    /** How many bodies have finished or been torn down. */
    get teardowns() {
      return teardowns;
    },
    enter(): void {
      inside++;
      peak = Math.max(peak, inside);
    },
    exit(): void {
      inside--;
      teardowns++;
    },
  };
}

type Witness = ReturnType<typeof createWitness>;

interface GamePass {
  publish(ply: GradedPly): void;
  finish(): void;
  fail(error: Error): void;
}

/**
 * A stand-in for `analyzeGameInBrowser` that the test drives by hand. Each
 * call is a separate `passes` entry, which is what makes a resumed pass
 * observable: the real function starts the game over, and the manager is
 * the thing that must not re-publish what it already sent.
 */
function scriptedGame(witness: Witness) {
  const passes: GamePass[] = [];

  vi.mocked(analyzeGameInBrowser).mockImplementation(function* (_input, publish) {
    const ended = withResolvers<void>();
    passes.push({
      publish,
      finish: () => ended.resolve(),
      fail: (error) => ended.reject(error),
    });
    witness.enter();
    yield* ensure(() => witness.exit());
    yield* ended.operation;
  });

  return { passes };
}

/** A stand-in for `evaluatePositionInBrowser` the test settles by hand. */
function scriptedEval(witness: Witness) {
  const calls: Array<{ resolve(raw: RawEval): void; reject(error: Error): void }> = [];

  vi.mocked(evaluatePositionInBrowser).mockImplementation(
    function* (): Operation<RawEval> {
      witness.enter();
      yield* ensure(() => witness.exit());
      const ready = withResolvers<RawEval>();
      calls.push(ready);
      return yield* ready.operation;
    },
  );

  return { calls };
}

function consume(manager: EngineManager, input: GameAnalysisInput = GAME) {
  const seen: GradedPly[] = [];
  const task = run(() =>
    manager.analyzeGame(input, (ply) => {
      seen.push(ply);
    }),
  );
  return { seen, task };
}

describe("EngineManager exclusivity and precedence", () => {
  it("lets an interactive evaluation preempt a running game, and only starts it once the game let go", async () => {
    const witness = createWitness();
    const game = scriptedGame(witness);
    const evaluation = scriptedEval(witness);

    const manager = createEngineManager();
    const background = consume(manager);
    await vi.waitFor(() => expect(game.passes).toHaveLength(1));
    game.passes[0]!.publish(aGradedPly(1));
    await vi.waitFor(() => expect(background.seen).toHaveLength(1));

    const interactive = run(() => manager.evaluatePosition(POSITION));
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(1));

    // The interactive call only got in once the background pass had been
    // fully torn down: at no point were both inside the engine.
    expect(witness.peak).toBe(1);
    expect(witness.teardowns).toBe(1);

    evaluation.calls[0]!.resolve(A_RAW_EVAL);
    expect(await interactive).toEqual(A_RAW_EVAL);

    await background.task.halt().catch(() => {});
  });

  it("makes a game wait for an active interactive evaluation instead of preempting it", async () => {
    const witness = createWitness();
    const game = scriptedGame(witness);
    const evaluation = scriptedEval(witness);

    const manager = createEngineManager();
    const interactive = run(() => manager.evaluatePosition(POSITION));
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(1));

    const background = consume(manager);
    // Give the scheduler several turns. The game must still be waiting.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(game.passes).toHaveLength(0);

    evaluation.calls[0]!.resolve(A_RAW_EVAL);
    expect(await interactive).toEqual(A_RAW_EVAL);

    // No lost wakeup: releasing the engine is what starts the game.
    await vi.waitFor(() => expect(game.passes).toHaveLength(1));
    expect(witness.peak).toBe(1);

    await background.task.halt().catch(() => {});
  });

  it("resumes a preempted game without re-publishing the plies already sent", async () => {
    const witness = createWitness();
    const game = scriptedGame(witness);
    const evaluation = scriptedEval(witness);

    const manager = createEngineManager();
    const background = consume(manager);
    await vi.waitFor(() => expect(game.passes).toHaveLength(1));
    game.passes[0]!.publish(aGradedPly(1));
    await vi.waitFor(() => expect(background.seen).toHaveLength(1));

    const interactive = run(() => manager.evaluatePosition(POSITION));
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(1));
    evaluation.calls[0]!.resolve(A_RAW_EVAL);
    await interactive;

    // The resumed pass replays the game from the first ply, as the real
    // one does off its cache. The caller must not see ply 1 twice.
    await vi.waitFor(() => expect(game.passes).toHaveLength(2));
    game.passes[1]!.publish(aGradedPly(1));
    game.passes[1]!.publish(aGradedPly(2));
    game.passes[1]!.finish();

    await background.task;
    expect(background.seen.map((ply) => ply.ply)).toEqual([1, 2]);
    expect(witness.peak).toBe(1);
  });

  it("serializes two game passes rather than running them together", async () => {
    const witness = createWitness();
    const game = scriptedGame(witness);

    const manager = createEngineManager();
    const first = consume(manager);
    await vi.waitFor(() => expect(game.passes).toHaveLength(1));

    // Which pass is the current one is the caller's decision, not the
    // manager's: a second one queues, and halting the first is what lets
    // it in.
    const second = consume(manager, { ...GAME, gameId: "game-b" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(game.passes).toHaveLength(1);

    await first.task.halt().catch(() => {});
    await vi.waitFor(() => expect(game.passes).toHaveLength(2));
    expect(witness.peak).toBe(1);

    game.passes[1]!.finish();
    await second.task;
  });

  it("frees the engine when a caller walks away mid-analysis", async () => {
    const witness = createWitness();
    const game = scriptedGame(witness);
    const evaluation = scriptedEval(witness);

    const manager = createEngineManager();
    const background = consume(manager);
    await vi.waitFor(() => expect(game.passes).toHaveLength(1));

    await background.task.halt().catch(() => {});

    const interactive = run(() => manager.evaluatePosition(POSITION));
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(1));
    evaluation.calls[0]!.resolve(A_RAW_EVAL);
    expect(await interactive).toEqual(A_RAW_EVAL);
    expect(witness.peak).toBe(1);
  });
});

describe("EngineManager outcomes", () => {
  it("tells completion, cancellation and failure apart", async () => {
    const witness = createWitness();
    const evaluation = scriptedEval(witness);
    const manager = createEngineManager();

    // Completed.
    const completed = run(() => manager.evaluatePosition(POSITION));
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(1));
    evaluation.calls[0]!.resolve(A_RAW_EVAL);
    expect(await completed).toEqual(A_RAW_EVAL);

    // Cancelled: a newer interactive call takes the engine from this one.
    const superseded = run(() => manager.evaluatePosition(POSITION));
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(2));
    const newer = run(() => manager.evaluatePosition({ fen: "fen-b", depth: 14 }));
    await expect(superseded).rejects.toBeInstanceOf(EnginePreempted);
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(3));
    evaluation.calls[2]!.resolve(A_RAW_EVAL);
    await newer;

    // Failed: the engine's own error reaches the caller unchanged, rather
    // than being reported as a cancellation.
    const boom = new Error("Engine failed twice evaluating fen-a");
    const failing = run(() => manager.evaluatePosition(POSITION));
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(4));
    evaluation.calls[3]!.reject(boom);
    await expect(failing).rejects.toBe(boom);

    // And the failure released the engine like any other outcome.
    const after = run(() => manager.evaluatePosition(POSITION));
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(5));
    evaluation.calls[4]!.resolve(A_RAW_EVAL);
    expect(await after).toEqual(A_RAW_EVAL);
    expect(witness.peak).toBe(1);
  });

  it("claims the engine atomically when several requests start in the same tick", async () => {
    const witness = createWitness();
    const game = scriptedGame(witness);
    const evaluation = scriptedEval(witness);
    const manager = createEngineManager();

    // No awaits in between: every request tests the free engine before
    // any of them has had a chance to suspend.
    const first = run(() => manager.evaluatePosition(POSITION));
    const second = run(() => manager.evaluatePosition({ fen: "fen-b", depth: 14 }));
    const background = consume(manager);

    await expect(first).rejects.toBeInstanceOf(EnginePreempted);
    await vi.waitFor(() => expect(evaluation.calls.length).toBeGreaterThanOrEqual(2));
    evaluation.calls.at(-1)!.resolve(A_RAW_EVAL);
    expect(await second).toEqual(A_RAW_EVAL);

    await vi.waitFor(() => expect(game.passes).toHaveLength(1));
    expect(witness.peak).toBe(1);

    await background.task.halt().catch(() => {});
  });

  it("surfaces a pass failure to its caller", async () => {
    const boom = new Error("engine failed twice evaluating fen-a");
    vi.mocked(analyzeGameInBrowser).mockImplementation(() =>
      call((): never => {
        throw boom;
      }),
    );

    const manager = createEngineManager();
    const background = consume(manager);

    await expect(background.task).rejects.toBe(boom);
  });

  it("releases the engine after a pass failure", async () => {
    const witness = createWitness();
    const evaluation = scriptedEval(witness);
    vi.mocked(analyzeGameInBrowser).mockImplementation(() =>
      call((): never => {
        throw new Error("engine failed");
      }),
    );

    const manager = createEngineManager();
    const background = consume(manager);
    await expect(background.task).rejects.toThrow("engine failed");

    const interactive = run(() => manager.evaluatePosition(POSITION));
    await vi.waitFor(() => expect(evaluation.calls).toHaveLength(1));
    evaluation.calls[0]!.resolve(A_RAW_EVAL);
    expect(await interactive).toEqual(A_RAW_EVAL);
  });
});
