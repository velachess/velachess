/**
 * Scripts `analyzeGameInBrowser`, so a test drives the real store and
 * the real coordinator with only the engine standing still. The
 * importing test must `vi.mock` that module.
 */
import { vi } from "vitest";

import type { GradedPly } from "@velachess/analysis";

import { ensure, withResolvers, type Operation } from "../../../libs/effection.ts";
import { analyzeGameInBrowser } from "../analyze-game-in-browser.ts";

export interface ScriptedPass {
  readonly gameId: string;
  publish(...plies: GradedPly[]): void;
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
        publish: (...plies) => publish(plies),
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
