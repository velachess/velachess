/**
 * Reliability around a bare `EngineSession`: how long to wait before
 * deciding the engine has gone silent, when to hurry it with `stop`, and
 * when to give up on a session and search again on a fresh one.
 *
 * Nothing here knows what a score means. It returns the engine's own
 * vocabulary — the last `info` line and the `bestmove` — and leaves white
 * POV, classification and caching to whoever asked.
 */

import {
  call,
  race,
  resource,
  sleep,
  suspend,
  useScope,
  withResolvers,
  type Operation,
  type Scope,
} from "effection";

import type { EngineSession } from "./engine-session.ts";
import type { BestMove, EngineUpdate, SearchOutcome } from "./types.ts";

/** Once `stop` has been sent, the whole remaining drain gets this long —
 * one deadline, not rearmed per line, so a chatty but stuck engine cannot
 * extend it. */
const DEFAULT_GRACE_MS = 2000;

/** A search the engine actually answered. */
export interface CompletedSearch {
  lastInfo?: EngineUpdate;
  bestMove: BestMove;
}

export interface EngineEvaluator {
  /** Searches `fen`, retrying once on a fresh session when the engine dies
   * or goes silent. Throws when both attempts fail. */
  evaluate(fen: string): Operation<CompletedSearch>;
}

export interface EngineEvaluatorOptions {
  depth: number;
  /** How long the engine may say nothing at all before it is hurried with
   * `stop`. Rearmed by every `info` line, so a slow deep search is not
   * mistaken for a dead one. */
  silenceTimeoutMs?: number;
  graceMs?: number;
}

/** Matches the shape used before this moved out of `@velachess/analysis`. */
export function silenceTimeoutFor(depth: number, override?: number): number {
  if (override !== undefined) return override;
  return Math.min(30_000, Math.max(5000, 3000 + depth * 400));
}

type Step =
  | { kind: "line"; result: IteratorResult<EngineUpdate, SearchOutcome> }
  | { kind: "silence" };

function completed(outcome: SearchOutcome): CompletedSearch | null {
  if (!outcome.bestMove) return null;
  return outcome.lastInfo
    ? { lastInfo: outcome.lastInfo, bestMove: outcome.bestMove }
    : { bestMove: outcome.bestMove };
}

function* searchOnce(
  session: EngineSession,
  fen: string,
  depth: number,
  silenceMs: number,
  graceMs: number,
): Operation<CompletedSearch | null> {
  session.setPosition(fen);
  const search = yield* session.search({ kind: "depth", depth });

  while (true) {
    const step: Step = yield* race([
      call(function* (): Operation<Step> {
        return { kind: "line", result: yield* search.next() };
      }),
      call(function* (): Operation<Step> {
        yield* sleep(silenceMs);
        return { kind: "silence" };
      }),
    ]);

    if (step.kind === "line") {
      if (!step.result.done) continue;
      return completed(step.result.value);
    }

    session.stop();
    const graced: SearchOutcome | undefined = yield* race([
      call(function* (): Operation<SearchOutcome | undefined> {
        while (true) {
          const next = yield* search.next();
          if (next.done) return next.value;
        }
      }),
      call(function* (): Operation<SearchOutcome | undefined> {
        yield* sleep(graceMs);
        return undefined;
      }),
    ]);
    return graced ? completed(graced) : null;
  }
}

interface SessionHolder {
  session: EngineSession;
  close: () => Operation<void>;
}

/**
 * A session that outlives the operation which opened it. `owner.run` is
 * synchronous and the task it returns is halted when `owner` unwinds, so
 * the evaluator needs no teardown of its own — and `suspend()` is what
 * keeps the session's own resource alive inside that task.
 *
 * `ready` is rejected rather than thrown so the failure arrives exactly
 * once, at the awaiting site: returning keeps the task's outcome
 * successful, which stops Effection from also raising it on `owner`, and
 * ends the task, which releases anything the failed open had already
 * acquired.
 */
function* openSessionHolder(
  owner: Scope,
  open: () => Operation<EngineSession>,
): Operation<SessionHolder> {
  const ready = withResolvers<EngineSession>();
  const task = owner.run(function* () {
    try {
      ready.resolve(yield* open());
    } catch (error) {
      ready.reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    yield* suspend();
  });

  return { session: yield* ready.operation, close: () => task.halt() };
}

export function useEngineEvaluator(
  open: () => Operation<EngineSession>,
  options: EngineEvaluatorOptions,
): Operation<EngineEvaluator> {
  return resource(function* (provide) {
    const { depth } = options;
    const silenceMs = silenceTimeoutFor(depth, options.silenceTimeoutMs);
    const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;

    const owner = yield* useScope();
    let holder = yield* openSessionHolder(owner, open);

    yield* provide({
      *evaluate(fen: string): Operation<CompletedSearch> {
        const first = yield* searchOnce(holder.session, fen, depth, silenceMs, graceMs);
        if (first) return first;

        // The retry budget is per call, not per evaluator: one failing
        // position never spends the whole game's only retry.
        yield* holder.close();
        holder = yield* openSessionHolder(owner, open);

        const second = yield* searchOnce(holder.session, fen, depth, silenceMs, graceMs);
        if (!second) throw new Error(`Engine failed twice evaluating ${fen}`);
        return second;
      },
    });
  });
}
