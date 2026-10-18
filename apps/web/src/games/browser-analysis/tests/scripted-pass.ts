/**
 * Scripts `analyzeGameInBrowser`, so a test drives the real store, the
 * real coordinator and the real `EngineManager` with only the engine
 * itself standing still. The importing test must `vi.mock` that module.
 */
import { ensure, withResolvers, type Operation } from "effection";
import { vi } from "vitest";

import type { GradedPly } from "@velachess/analysis";

import { analyzeGameInBrowser } from "../analyze-game-in-browser.ts";

export interface ScriptedPass {
  readonly gameId: string;
  publish(ply: GradedPly): void;
  finish(): void;
  fail(error: Error): void;
  /** True once the pass was torn down without having ended on its own. */
  wasHalted(): boolean;
}

export function scriptedPasses(): ScriptedPass[] {
  const passes: ScriptedPass[] = [];

  vi.mocked(analyzeGameInBrowser).mockImplementation(
    function* (input, publish): Operation<void> {
      const ended = withResolvers<void>();
      let torn = false;
      let completed = false;

      passes.push({
        gameId: input.gameId,
        publish,
        finish: () => ended.resolve(),
        fail: (error) => ended.reject(error),
        wasHalted: () => torn && !completed,
      });

      yield* ensure(() => {
        torn = true;
      });
      yield* ended.operation;
      completed = true;
    },
  );

  return passes;
}
