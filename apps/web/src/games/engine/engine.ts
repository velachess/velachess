/**
 * Stockfish sessions, and nothing else. A session owns one Worker, runs
 * one search at a time on it, and keeps it across searches — which is the
 * only thing `@velachess/infra-engine` cannot do on its own, because its
 * evaluator dies with the scope that opened it and a cancelling caller is
 * exactly the scope that would take the Worker down.
 *
 * Sessions never see each other. There is no registry, no lane, no
 * priority and no shared lock: `createEngine` keeps nothing but its
 * dependencies, so coordinating two sessions is not something this file
 * declines to do, it is something it has no way to express.
 */
import {
  call,
  createScope,
  ensure,
  Err,
  Ok,
  race,
  sleep,
  suspend,
  unbox,
  withResolvers,
  type Operation,
  type Result,
  type Task,
  type WithResolvers,
} from "../../libs/effection.ts";
import {
  useEngineEvaluator,
  type CompletedSearch,
  type EngineEvaluator,
  type EngineSession,
} from "@velachess/infra-engine";

/**
 * Once a search has been asked to stop, how long it may take to answer
 * `bestmove` before its Worker is killed. Infra's watchdog cannot serve
 * here: it measures *silence* and is rearmed by every `info` line, so an
 * engine that keeps talking while ignoring `stop` never trips it.
 */
const DEFAULT_STOP_SETTLE_MS = 2000;

/** A newer search took this session's engine, or the session was disposed
 * while the search was still running. Not a failure: there is simply
 * nothing to show for it. */
export class SearchSuperseded extends Error {
  constructor() {
    super("A newer search superseded this one");
    this.name = "SearchSuperseded";
  }
}

/** `dispose()` is final — the handle never searches again. */
export class EngineSessionDisposed extends Error {
  constructor() {
    super("This engine session has been disposed");
    this.name = "EngineSessionDisposed";
  }
}

export interface EngineSessionHandle {
  /** Supersedes whatever this session has in flight. */
  evaluate(fen: string): Operation<CompletedSearch>;
  dispose(): Operation<void>;
}

export interface Engine {
  createSession(options: { depth: number }): EngineSessionHandle;
}

export interface EngineDeps {
  openSession: () => Operation<EngineSession>;
  stopSettleMs?: number;
  silenceTimeoutMs?: number;
}

interface Search {
  /** The running search, detached into the session's scope. `null` until
   * this search reaches the engine, which it may never do. */
  searchTask: Task<Result<CompletedSearch>> | null;
  /** A newer search, or disposal, took the engine. Decides whether the
   * outcome is delivered or dropped. */
  superseded: boolean;
  /** The engine produced an outcome, so there is nothing left to stop.
   * Not the same fact as `released`: a search that never reached the
   * engine releases it without ever completing. */
  completed: boolean;
  /** Resolves when this search has stopped using the Worker — the link
   * the next one waits on, and the session's only serialization. */
  released: WithResolvers<void>;
}

function createSearch(): Search {
  return {
    searchTask: null,
    superseded: false,
    completed: false,
    released: withResolvers<void>(),
  };
}

export function createEngine(deps: EngineDeps): Engine {
  const stopSettleMs = deps.stopSettleMs ?? DEFAULT_STOP_SETTLE_MS;

  return {
    createSession({ depth }) {
      const [scope, destroy] = createScope();

      let disposed = false;
      let worker: EngineEvaluator | null = null;
      let workerTask: Task<void> | null = null;
      /** The open in flight, so two searches racing for a Worker wait on
       * one rather than starting two. It carries its outcome as a value
       * for the same reason the search does: a failing task raises on the
       * scope that owns it, and this one is the session's. */
      let opening: WithResolvers<Result<EngineEvaluator>> | null = null;
      /** The most recent search, running or not. The chain it heads ends
       * at the first link that has already released. */
      let activeSearch: Search | null = null;

      function assertNotDisposed(): void {
        if (disposed) throw new EngineSessionDisposed();
      }

      function* closeWorker(): Operation<void> {
        const task = workerTask;
        worker = null;
        workerTask = null;
        // An open still in flight is halted with it, and its own teardown
        // is what tells the search waiting on it.
        if (task) yield* task.halt();
      }

      /**
       * Lazy, and re-openable for as long as the session is alive: a stop
       * that went unanswered leaves no Worker behind, and the next search
       * opens one. Disposal is the only thing this does not recover from.
       *
       * The Worker is published from inside the opening task, not by the
       * search that asked for it: a search cancelled mid-open would
       * otherwise leave a live Worker nobody had registered, and the next
       * one would open a second.
       */
      function* getOrOpenWorker(): Operation<EngineEvaluator> {
        assertNotDisposed();
        if (worker) return worker;
        if (opening) return unbox(yield* opening.operation);

        const ready = withResolvers<Result<EngineEvaluator>>();
        opening = ready;
        workerTask = scope.run(function* (): Operation<void> {
          // Settles the waiting search exactly once: here on success,
          // below on the open's own failure, or through this hook when
          // the open is halted before either — which would otherwise
          // leave that search waiting on a Worker nobody is opening.
          yield* ensure(() => {
            opening = null;
            ready.resolve(
              Err(disposed ? new EngineSessionDisposed() : new SearchSuperseded()),
            );
          });

          let evaluator: EngineEvaluator;
          try {
            evaluator = yield* useEngineEvaluator(deps.openSession, {
              depth,
              ...(deps.silenceTimeoutMs === undefined
                ? {}
                : { silenceTimeoutMs: deps.silenceTimeoutMs }),
            });
          } catch (error) {
            // Carried rather than rethrown so the failure lands once, at
            // the waiting search, instead of also raising on the
            // session's scope and taking the session down with it.
            ready.resolve(Err(error));
            return;
          }

          if (disposed) return;
          worker = evaluator;
          opening = null;
          ready.resolve(Ok(evaluator));
          yield* suspend();
        });

        return unbox(yield* ready.operation);
      }

      /**
       * `go` → `stop` → `bestmove`, bounded — and it returns only once
       * the Worker is genuinely idle again, whether because the engine
       * answered or because it was killed for not answering. Callers rely
       * on that: it is what lets the next search speak.
       */
      function* stopSearch(search: Search): Operation<void> {
        if (search.completed) return;
        search.superseded = true;
        const running = search.searchTask;
        if (!running) return;

        worker?.stop();
        const answered = yield* race([
          call(function* (): Operation<boolean> {
            yield* search.released.operation;
            return true;
          }),
          call(function* (): Operation<boolean> {
            yield* sleep(stopSettleMs);
            return false;
          }),
        ]);
        if (answered) return;

        // Halted before the Worker is closed: infra leaves a halted
        // session marked as searching on purpose, for its owner to
        // discard, and discarding it is exactly what happens next.
        yield* running.halt();
        yield* closeWorker();
      }

      /**
       * The caller stopped waiting. A search it left running has to be
       * handed back before the next one may speak — and a search that
       * never reached the engine still has to release the link, once the
       * search it replaced has.
       */
      function* releaseSearch(
        search: Search,
        previousSearch: Search | null,
      ): Operation<void> {
        if (search.completed) return;
        if (search.searchTask) {
          yield* stopSearch(search);
          return;
        }
        if (previousSearch) yield* previousSearch.released.operation;
        search.released.resolve();
      }

      /**
       * Runs the search in the session's scope rather than the caller's,
       * so a caller that walks away cannot leave the engine mid-search
       * with nobody to drain it, and hands back what the engine said.
       *
       * The outcome travels as a value, because a failing task raises on
       * the scope that owns it — which would tear the session down
       * instead of answering the one search that failed.
       */
      function* executeSearch(
        evaluator: EngineEvaluator,
        search: Search,
        fen: string,
      ): Operation<CompletedSearch> {
        // Superseded while the Worker was opening: starting now would be
        // a search nobody is waiting for.
        if (search.superseded) throw new SearchSuperseded();

        search.searchTask = scope.run(function* (): Operation<Result<CompletedSearch>> {
          try {
            return Ok(yield* evaluator.evaluate(fen));
          } catch (error) {
            return Err(error);
          } finally {
            search.completed = true;
            search.released.resolve();
          }
        });

        let settled: Result<CompletedSearch>;
        try {
          settled = yield* search.searchTask;
        } catch {
          // Unwinding never enters a `catch`, so a raise here is always a
          // deliberate halt: the Worker was closed under the search, or
          // the session was disposed.
          throw disposed ? new EngineSessionDisposed() : new SearchSuperseded();
        }
        if (search.superseded) throw new SearchSuperseded();

        try {
          return unbox(settled);
        } catch (error) {
          // Infra already retried on a fresh session, so a failure
          // arriving here means this Worker is not worth keeping.
          yield* closeWorker();
          throw error;
        }
      }

      return {
        *evaluate(fen: string): Operation<CompletedSearch> {
          assertNotDisposed();

          const previousSearch = activeSearch;
          const search = createSearch();
          activeSearch = search;
          yield* ensure(() => releaseSearch(search, previousSearch));

          if (previousSearch) {
            yield* stopSearch(previousSearch);
            yield* previousSearch.released.operation;
          }
          if (search.superseded) throw new SearchSuperseded();

          const evaluator = yield* getOrOpenWorker();
          return yield* executeSearch(evaluator, search, fen);
        },

        *dispose(): Operation<void> {
          if (disposed) return;
          disposed = true;
          worker = null;
          workerTask = null;
          activeSearch = null;
          // Unwinding the scope halts the search task, whose `finally`
          // releases anything waiting on it, and quits the engine before
          // the Worker is terminated.
          yield* destroy();
        },
      };
    },
  };
}
