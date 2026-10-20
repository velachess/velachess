/**
 * Ties a Transport to the UCI protocol: handshake, position, go/stop. One
 * session owns one underlying process/worker for the lifetime of the scope
 * that opened it — the handshake happens before the session is handed out,
 * and leaving that scope sends `quit` and closes the transport.
 *
 * This file knows nothing about watchdogs, retries or recovering a dead
 * engine; that is `engine-evaluator.ts`.
 */

import {
  call,
  ensure,
  race,
  resource,
  sleep,
  type Operation,
  type Stream,
  type Subscription,
} from "effection";

import {
  buildGoCommand,
  buildPositionCommand,
  buildSetOptionCommand,
  parseBestMoveLine,
  parseInfoLine,
} from "./protocol.ts";
import type { OpenTransport, Transport } from "./transport.ts";
import type { EngineOption, EngineUpdate, GoMode, SearchOutcome } from "./types.ts";

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;

export interface EngineSession {
  setOption(option: EngineOption): void;
  setPosition(fen: string, moves?: string[]): void;
  /** Each `info` line as it arrives; the stream's return value is what the
   * search settled on. Only one search may be in flight at a time. */
  search(mode: GoMode): Stream<EngineUpdate, SearchOutcome>;
  /** Asks the engine to stop early — the in-flight search still returns an
   * outcome, because a real UCI engine answers `stop` with a bestmove. */
  stop(): void;
}

export interface EngineSessionOptions {
  handshakeTimeoutMs?: number;
  uciOptions?: readonly EngineOption[];
}

function* drainUntil(
  transport: Transport,
  isDone: (line: string) => boolean,
): Operation<void> {
  while (true) {
    const next = yield* transport.lines.next();
    if (next.done) throw new Error("Engine closed before completing the handshake");
    if (isDone(next.value)) return;
  }
}

function* handshake(transport: Transport, timeoutMs: number): Operation<void> {
  const outcome = yield* race([
    call(function* (): Operation<"ready"> {
      transport.send("uci");
      yield* drainUntil(transport, (line) => line === "uciok");
      transport.send("isready");
      yield* drainUntil(transport, (line) => line === "readyok");
      return "ready";
    }),
    call(function* (): Operation<"timeout"> {
      yield* sleep(timeoutMs);
      return "timeout";
    }),
  ]);

  if (outcome === "timeout") {
    throw new Error(`Engine handshake timed out after ${timeoutMs}ms`);
  }
}

export function useEngineSession(
  open: OpenTransport,
  options: EngineSessionOptions = {},
): Operation<EngineSession> {
  return resource(function* (provide) {
    const transport = yield* open();
    // Registered after the transport is open, so it unwinds before the
    // transport's own teardown: the engine is told to quit while it can
    // still hear it.
    yield* ensure(() => transport.send("quit"));

    yield* handshake(
      transport,
      options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
    );

    for (const option of options.uciOptions ?? []) {
      transport.send(buildSetOptionCommand(option.name, option.value));
    }

    let searching = false;

    const search = (mode: GoMode): Stream<EngineUpdate, SearchOutcome> =>
      call((): Subscription<EngineUpdate, SearchOutcome> => {
        if (searching) {
          throw new Error(
            "EngineSession.search() called while a previous search is still in flight",
          );
        }
        searching = true;

        let lastInfo: EngineUpdate | undefined;
        let settled: SearchOutcome | undefined;

        // A consumer that walks away mid-search (a watchdog giving up)
        // leaves `searching` true on purpose: the session is no longer
        // trustworthy and its owner is expected to discard it.
        const finish = (bestMove: SearchOutcome["bestMove"]): SearchOutcome => {
          searching = false;
          settled = lastInfo ? { lastInfo, bestMove } : { bestMove };
          return settled;
        };

        transport.send(buildGoCommand(mode));

        return {
          *next() {
            if (settled) return { done: true, value: settled };
            while (true) {
              const next = yield* transport.lines.next();
              if (next.done) return { done: true, value: finish(null) };

              const line = next.value;
              if (line.startsWith("bestmove")) {
                return { done: true, value: finish(parseBestMoveLine(line)) };
              }

              const update = parseInfoLine(line);
              if (!update) continue;
              if (update.multipv === 1) lastInfo = update;
              return { done: false, value: update };
            }
          },
        };
      });

    yield* provide({
      setOption: (option) =>
        transport.send(buildSetOptionCommand(option.name, option.value)),
      setPosition: (fen, moves = []) => transport.send(buildPositionCommand(fen, moves)),
      search,
      stop: () => transport.send("stop"),
    });
  });
}
