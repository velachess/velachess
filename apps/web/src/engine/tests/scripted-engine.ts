/**
 * A scripted UCI engine for the browser suites — answers the handshake,
 * then replies to each `go` with whatever the test queued. `stop` mimics
 * a real engine: a search with no queued reply is answered immediately
 * rather than left hanging, because "stop" always produces a bestmove
 * promptly.
 *
 * It refuses a `go` while a search is still outstanding. That is the
 * one-search-per-session rule written a second time, on purpose: the fake
 * enforces it and the session is supposed to respect it, so a session
 * that releases the next request before `bestmove` fails here rather than
 * quietly working.
 *
 * Local to these tests rather than imported from
 * `libs/infra/engine/tests/` — a test-only helper does not cross a
 * package boundary.
 */
import { createQueue, ensure, resource, type Operation } from "../../libs/effection.ts";
import type { Transport } from "@velachess/infra-engine";

export interface ScriptedEngineOptions {
  /** Keeps searching through `stop`, like a Worker whose WASM module is
   * wedged: the only way out is killing it. */
  ignoreStop?: boolean;
  /** Withholds the handshake until `answerHandshake()`, so a test can act
   * while a session is still opening. */
  holdHandshake?: boolean;
}

export interface ScriptedEngine {
  /** Every command the session sent, in order. */
  readonly sent: readonly string[];
  /** Every `go` the engine was actually asked to search — a cache hit
   * must never increment this. */
  readonly goCallCount: number;
  /** True between a `go` and the `bestmove` that answers it. */
  readonly searching: boolean;
  closed: boolean;
  queueGoResponse(lines: string[]): void;
  /** Keeps the engine talking without finishing, so a silence watchdog
   * stays disarmed. */
  emitInfo(cp: number, depth?: number): void;
  /** Lets a held handshake through, finishing the open. */
  answerHandshake(): void;
  /** A Worker whose WASM module died: the line stream simply ends, which
   * is all a crashed Worker ever tells anyone. */
  crash(): void;
  open: () => Operation<Transport>;
}

export function goLines(cp: number, bestMove: string, depth = 14): string[] {
  return [
    `info depth ${depth} multipv 1 score cp ${cp} pv ${bestMove}`,
    `bestmove ${bestMove}`,
  ];
}

export function createScriptedEngine(
  options: ScriptedEngineOptions = {},
): ScriptedEngine {
  const lines = createQueue<string, void>();
  const sent: string[] = [];
  const goResponses: string[][] = [];
  let goCallCount = 0;
  let searching = false;
  let awaitingGo = false;
  let holdingHandshake = options.holdHandshake ?? false;
  const heldHandshake: string[] = [];

  const emit = (...values: string[]) => {
    for (const value of values) lines.add(value);
  };

  const answer = (response: string[]) => {
    searching = false;
    awaitingGo = false;
    emit(...response);
  };

  const engine: ScriptedEngine = {
    sent,
    get goCallCount() {
      return goCallCount;
    },
    get searching() {
      return searching;
    },
    closed: false,
    queueGoResponse(response) {
      goResponses.push(response);
      if (awaitingGo) answer(goResponses.shift()!);
    },
    emitInfo(cp, depth = 14) {
      emit(`info depth ${depth} multipv 1 score cp ${cp} pv e2e4`);
    },
    answerHandshake() {
      holdingHandshake = false;
      emit(...heldHandshake.splice(0));
    },
    crash() {
      lines.close();
    },
    open: () =>
      resource(function* (provide) {
        yield* ensure(() => {
          engine.closed = true;
          lines.close();
        });

        yield* provide({
          send(command: string) {
            sent.push(command);
            if (command === "uci" || command === "isready") {
              const reply = command === "uci" ? "uciok" : "readyok";
              if (holdingHandshake) heldHandshake.push(reply);
              else emit(reply);
            } else if (command.startsWith("go")) {
              if (searching) {
                throw new Error(`"${command}" arrived while a search was outstanding`);
              }
              goCallCount++;
              searching = true;
              const response = goResponses.shift();
              if (response) answer(response);
              else awaitingGo = true;
            } else if (command === "stop" && awaitingGo && !options.ignoreStop) {
              answer(["bestmove (none)"]);
            }
          },
          lines,
        });
      }),
  };

  return engine;
}
