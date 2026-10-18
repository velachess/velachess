/**
 * A scripted UCI engine for the browser-analysis suites — answers the
 * handshake, then replies to each `go` with whatever the test queued.
 * `stop` mimics a real engine: a search with no queued reply is answered
 * immediately rather than left hanging, because "stop" always produces a
 * bestmove promptly.
 *
 * Local to these tests rather than imported from
 * `libs/infra/engine/tests/` — a test-only helper does not cross a
 * package boundary.
 */
import {
  createQueue,
  ensure,
  resource,
  type Operation,
} from "../../../libs/effection.ts";
import type { Transport } from "@velachess/infra-engine";

export interface ScriptedEngine {
  /** Every `go` the engine was actually asked to search — a cache hit
   * must never increment this. */
  readonly goCallCount: number;
  closed: boolean;
  queueGoResponse(lines: string[]): void;
  open: () => Operation<Transport>;
}

export function goLines(cp: number, bestMove: string, depth = 14): string[] {
  return [
    `info depth ${depth} multipv 1 score cp ${cp} pv ${bestMove}`,
    `bestmove ${bestMove}`,
  ];
}

export function createScriptedEngine(): ScriptedEngine {
  const lines = createQueue<string, void>();
  const goResponses: string[][] = [];
  let goCallCount = 0;
  let awaitingGo = false;

  const emit = (...values: string[]) => {
    for (const value of values) lines.add(value);
  };

  const engine: ScriptedEngine = {
    get goCallCount() {
      return goCallCount;
    },
    closed: false,
    queueGoResponse(response) {
      goResponses.push(response);
      if (awaitingGo) {
        awaitingGo = false;
        emit(...goResponses.shift()!);
      }
    },
    open: () =>
      resource(function* (provide) {
        yield* ensure(() => {
          engine.closed = true;
          lines.close();
        });

        yield* provide({
          send(command: string) {
            if (command === "uci") emit("uciok");
            else if (command === "isready") emit("readyok");
            else if (command.startsWith("go")) {
              goCallCount++;
              const response = goResponses.shift();
              if (response) emit(...response);
              else awaitingGo = true;
            } else if (command === "stop" && awaitingGo) {
              awaitingGo = false;
              emit("bestmove (none)");
            }
          },
          lines,
        });
      }),
  };

  return engine;
}
