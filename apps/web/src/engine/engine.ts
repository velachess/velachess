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
} from "../libs/effection.ts";
import {
  useEngineEvaluator,
  type CompletedSearch,
  type EngineEvaluator,
  type EngineSession,
  type OnEngineUpdate,
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
  /** Supersedes whatever this session has in flight. `onUpdate` receives
   * this search's `info` lines, and only while it is still the session's
   * current one. */
  evaluate(fen: string, onUpdate?: OnEngineUpdate): Operation<CompletedSearch>;
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
  /**
   * The running search, detached into the session's scope. `null` before
   * it starts and again the moment it ends, so this one field answers the
   * only question anyone asks of it: is the engine busy on this search
   * right now? Effection's `Task` cannot be asked.
   */
  searchTask: Task<Result<CompletedSearch>> | null;
  /** Resolves when this search has stopped using the Worker — the link
   * the next one waits on, and the session's only serialization. A search
   * that never reached the engine still has one, which is why this cannot
   * be read off `searchTask`. */
  released: WithResolvers<void>;
}

/** The session's Worker, in the three states it can be in. A union rather
 * than three fields, so "open while opening" cannot be written. */
type WorkerSlot =
  | { readonly status: "idle" }
  | {
      readonly status: "opening";
      readonly task: Task<void>;
      readonly ready: WithResolvers<Result<EngineEvaluator>>;
    }
  | {
      readonly status: "ready";
      readonly task: Task<void>;
      readonly evaluator: EngineEvaluator;
    };

const IDLE: WorkerSlot = { status: "idle" };

function createSearch(): Search {
  return { searchTask: null, released: withResolvers<void>() };
}

export function createEngine(deps: EngineDeps): Engine {
  const stopSettleMs = deps.stopSettleMs ?? DEFAULT_STOP_SETTLE_MS;

  return {
    createSession({ depth }) {
      const [scope, destroy] = createScope();

      let disposed = false;
      let workerSlot: WorkerSlot = IDLE;
      /** The most recent search, running or not. */
      let latestSearch: Search | null = null;

      function assertNotDisposed(): void {
        if (disposed) throw new EngineSessionDisposed();
      }

      /** A search is stale exactly when it is no longer the latest one:
       * `evaluate` claims `latestSearch` before it can block, and
       * `dispose` clears it. Nothing else can make a search stale, so
       * nothing has to record that it is. */
      function isSuperseded(search: Search): boolean {
        return latestSearch !== search;
      }

      function* closeWorker(): Operation<void> {
        const slot = workerSlot;
        workerSlot = IDLE;
        // An open still in flight is halted with it, and its own teardown
        // is what tells the search waiting on it.
        if (slot.status !== "idle") yield* slot.task.halt();
      }

      /**
       * Opens the session's Worker and publishes it from in here, rather
       * than handing it back for the search that asked to register: a
       * search cancelled mid-open would otherwise leave a live Worker
       * nobody had recorded, and the next one would open a second.
       */
      function* openWorker(
        ready: WithResolvers<Result<EngineEvaluator>>,
      ): Operation<void> {
        // Settles the waiting searches exactly once: below on success or
        // on the open's own failure, and through this hook when the open
        // is halted before either — which would otherwise leave them
        // waiting on a Worker nobody is opening. A second `resolve`
        // cannot change an outcome already latched.
        yield* ensure(() => {
          if (workerSlot.status === "opening") workerSlot = IDLE;
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
          // Carried rather than rethrown so the failure lands once, at the
          // searches waiting for it, instead of also raising on the
          // session's scope and taking the session down with it.
          ready.resolve(Err(error));
          return;
        }

        // The slot cannot have moved to another open while this one was
        // alive — everything that takes it away (`closeWorker`, `dispose`)
        // halts this task first — so `opening` here is always this open.
        // Disposal is the one race left, and it publishes nothing.
        if (disposed || workerSlot.status !== "opening") return;
        workerSlot = { status: "ready", task: workerSlot.task, evaluator };
        ready.resolve(Ok(evaluator));
        yield* suspend();
      }

      /**
       * Lazy, and re-openable for as long as the session is alive: a stop
       * that went unanswered leaves no Worker behind, and the next search
       * opens one. Searches that arrive while one is opening share it
       * rather than starting a second. Disposal is the only thing this
       * does not recover from.
       */
      function* getOrOpenWorker(): Operation<EngineEvaluator> {
        assertNotDisposed();
        if (workerSlot.status === "ready") return workerSlot.evaluator;
        if (workerSlot.status === "opening") {
          return unbox(yield* workerSlot.ready.operation);
        }

        const ready = withResolvers<Result<EngineEvaluator>>();
        const task = scope.run(() => openWorker(ready));
        workerSlot = { status: "opening", task, ready };
        return unbox(yield* ready.operation);
      }

      /**
       * `go` → `stop` → `bestmove`, bounded — and it returns only once
       * the Worker is genuinely idle again, whether because the engine
       * answered or because it was killed for not answering. Callers rely
       * on that: it is what lets the next search speak.
       */
      function* stopSearch(search: Search): Operation<void> {
        const running = search.searchTask;
        if (!running) return;

        if (workerSlot.status === "ready") workerSlot.evaluator.stop();
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
       * handed back before the next one may speak.
       */
      function* releaseSearch(
        search: Search,
        previousSearch: Search | null,
      ): Operation<void> {
        if (search.searchTask) {
          yield* stopSearch(search);
          return;
        }
        // Not running — it either never started or has already ended, so
        // it holds nothing of its own. The next search still waits on this
        // link, so it releases once the search it replaced has.
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
        onUpdate?: OnEngineUpdate,
      ): Operation<CompletedSearch> {
        // Superseded while the Worker was opening: starting now would be
        // a search nobody is waiting for.
        if (isSuperseded(search)) throw new SearchSuperseded();

        const task = scope.run(function* (): Operation<Result<CompletedSearch>> {
          try {
            // Guarded rather than detached on supersede: the search runs
            // to its own end in this scope, and a line it produces after
            // being replaced would otherwise read as the current one's.
            return Ok(
              yield* evaluator.evaluate(fen, (update) => {
                if (!isSuperseded(search)) onUpdate?.(update);
              }),
            );
          } catch (error) {
            return Err(error);
          } finally {
            search.searchTask = null;
            search.released.resolve();
          }
        });
        search.searchTask = task;

        let settled: Result<CompletedSearch>;
        try {
          settled = yield* task;
        } catch {
          // Unwinding never enters a `catch`, so a raise here is always a
          // deliberate halt: the Worker was closed under the search, or
          // the session was disposed.
          throw disposed ? new EngineSessionDisposed() : new SearchSuperseded();
        }
        if (isSuperseded(search)) throw new SearchSuperseded();

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
        *evaluate(fen: string, onUpdate?: OnEngineUpdate): Operation<CompletedSearch> {
          assertNotDisposed();

          const previousSearch = latestSearch;
          const search = createSearch();
          latestSearch = search;
          yield* ensure(() => releaseSearch(search, previousSearch));

          if (previousSearch) {
            yield* stopSearch(previousSearch);
            yield* previousSearch.released.operation;
          }
          if (isSuperseded(search)) throw new SearchSuperseded();

          const evaluator = yield* getOrOpenWorker();
          return yield* executeSearch(evaluator, search, fen, onUpdate);
        },

        *dispose(): Operation<void> {
          if (disposed) return;
          disposed = true;
          workerSlot = IDLE;
          latestSearch = null;
          // Unwinding the scope halts whatever the session was running —
          // an open still in flight included, freeing what it had already
          // acquired — and quits the engine before the Worker is
          // terminated. The search task's `finally` releases anything
          // waiting on it.
          yield* destroy();
        },
      };
    },
  };
}
