/**
 * Ties a Transport to the UCI protocol: handshake, position, go/stop, and a
 * live stream of evaluation updates. One EngineSession owns one underlying
 * process/worker for its whole lifetime — init() once, go() as many times
 * as needed, quit() when done.
 */

import {
  buildGoCommand,
  buildPositionCommand,
  buildSetOptionCommand,
  parseBestMoveLine,
  parseInfoLine,
} from "./protocol.ts";
import type { Transport } from "./transport.ts";
import type { BestMove, EngineOption, EngineUpdate, GoMode } from "./types.ts";

export interface GoResult {
  /** Yields each parsed `info` line as it arrives. Ends once bestmove is seen. */
  updates: AsyncIterable<EngineUpdate>;
  /** Resolves to the final bestmove — null if the transport closed first. */
  bestMove: Promise<BestMove | null>;
}

export class EngineSession {
  private readonly transport: Transport;
  private readonly iterator: AsyncIterator<string>;
  private inFlight = false;

  constructor(transport: Transport) {
    this.transport = transport;
    this.iterator = transport.lines()[Symbol.asyncIterator]();
  }

  /** Fails instead of hanging when the engine never completes the handshake. */
  async init(options: { timeoutMs?: number } = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Engine handshake timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    try {
      await Promise.race([
        (async () => {
          this.transport.send("uci");
          await this.drainUntil((line) => line === "uciok");
          this.transport.send("isready");
          await this.drainUntil((line) => line === "readyok");
        })(),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  setOption(option: EngineOption): void {
    this.transport.send(buildSetOptionCommand(option.name, option.value));
  }

  setPosition(fen: string, moves: string[] = []): void {
    this.transport.send(buildPositionCommand(fen, moves));
  }

  /**
   * Only one search may be in flight at a time — both go() calls would
   * pull from the same underlying line stream, splitting lines between
   * them unpredictably. Await the previous bestMove (or stop() it) first.
   */
  go(mode: GoMode): GoResult {
    if (this.inFlight) {
      throw new Error(
        "EngineSession.go() called while a previous search is still in flight",
      );
    }
    this.inFlight = true;

    let resolveBestMove!: (move: BestMove | null) => void;
    const bestMove = new Promise<BestMove | null>((resolve) => {
      resolveBestMove = resolve;
    });

    // Draining the transport can't wait on the caller pulling `updates` —
    // if they stop early (e.g. call stop() after the first update),
    // bestMove still has to resolve once the engine actually replies. So
    // this pump runs on its own, and `updates` just drains whatever it's
    // queued so far.
    const queue: EngineUpdate[] = [];
    let notify: (() => void) | null = null;
    let finished = false;

    const wake = () => {
      const resolve = notify;
      notify = null;
      resolve?.();
    };

    void (async () => {
      while (true) {
        const next = await this.iterator.next();
        if (next.done) {
          finished = true;
          this.inFlight = false;
          resolveBestMove(null);
          wake();
          return;
        }

        const line = next.value;
        if (line.startsWith("bestmove")) {
          finished = true;
          this.inFlight = false;
          resolveBestMove(parseBestMoveLine(line));
          wake();
          return;
        }

        const update = parseInfoLine(line);
        if (update) {
          queue.push(update);
          wake();
        }
      }
    })();

    const updates = (async function* (): AsyncIterable<EngineUpdate> {
      while (true) {
        const queued = queue.shift();
        if (queued) {
          yield queued;
          continue;
        }
        if (finished) return;
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    })();

    this.transport.send(buildGoCommand(mode));
    return { updates, bestMove };
  }

  /** Asks the engine to stop early — the in-flight go()'s bestMove still resolves normally. */
  stop(): void {
    this.transport.send("stop");
  }

  quit(): void {
    this.transport.send("quit");
    this.transport.close();
  }

  private async drainUntil(isDone: (line: string) => boolean): Promise<void> {
    while (true) {
      const next = await this.iterator.next();
      if (next.done || isDone(next.value)) return;
    }
  }
}
