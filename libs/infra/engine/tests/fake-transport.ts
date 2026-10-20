/**
 * In-memory Transport for deterministic session and evaluator tests — no
 * real process or worker. `emit()` simulates lines arriving from the
 * engine, `end()` simulates the process/worker going away mid-stream
 * without a final line, and `sent` records every command the session sent.
 *
 * Teardown pushes `CLOSED` onto `sent` rather than only flipping a flag,
 * so a test can assert what was sent *before* the transport went away —
 * `quit` reaching an engine that can still hear it is an ordering
 * guarantee, not just a pair of side effects.
 */

import { createQueue, ensure, resource, type Operation } from "effection";

import type { OpenTransport, Transport } from "../transport.ts";

export const CLOSED = "<closed>";

export interface FakeEngineOptions {
  /** Answer `uci`/`isready`, so a session's handshake completes. */
  handshake?: boolean;
  /** Scripted reaction to every command, after it is recorded. */
  onCommand?: (command: string, emit: (...lines: string[]) => void) => void;
}

export interface FakeEngine {
  readonly sent: string[];
  closed: boolean;
  /** How many transports this engine has been opened as. */
  readonly opens: number;
  emit(...lines: string[]): void;
  end(): void;
  open: OpenTransport;
}

export function createFakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  const sent: string[] = [];
  let lines = createQueue<string, void>();
  let opens = 0;

  const emit = (...values: string[]) => {
    for (const value of values) lines.add(value);
  };

  const engine: FakeEngine = {
    sent,
    closed: false,
    get opens() {
      return opens;
    },
    emit,
    end: () => lines.close(),
    open: (): Operation<Transport> =>
      resource(function* (provide) {
        opens++;
        engine.closed = false;
        lines = createQueue<string, void>();

        yield* ensure(() => {
          engine.closed = true;
          sent.push(CLOSED);
        });

        yield* provide({
          send(command: string) {
            sent.push(command);
            if (options.handshake) {
              if (command === "uci") emit("uciok");
              else if (command === "isready") emit("readyok");
            }
            options.onCommand?.(command, emit);
          },
          lines,
        });
      }),
  };

  return engine;
}
