/**
 * A session owns one Worker and keeps it across searches, which
 * `@velachess/infra-engine` cannot do on its own: its evaluator dies with
 * the scope that opened it, and a cancelling caller is that scope.
 *
 * Sessions never see each other: no registry, no lane, no shared lock.
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
 * How long a stopped search may take to answer `bestmove` before its Worker
 * is killed. Infra's watchdog measures silence, so an engine that keeps
 * talking while ignoring `stop` never trips it.
 */
const DEFAULT_STOP_SETTLE_MS = 2000;

export class SearchSuperseded extends Error {
  constructor() {
    super("A newer search superseded this one");
    this.name = "SearchSuperseded";
  }
}

export class EngineSessionDisposed extends Error {
  constructor() {
    super("This engine session has been disposed");
    this.name = "EngineSessionDisposed";
  }
}

export interface EngineSessionHandle {
  /** Supersedes whatever is in flight. `onUpdate` receives this search's
   * `info` lines only while it is the current one. */
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
  /** Null before the search starts and again once it ends: an Effection
   * `Task` cannot be asked whether it is still running. */
  searchTask: Task<Result<CompletedSearch>> | null;
  /** The session's only serialization. A search that never reached the
   * engine still has one. */
  released: WithResolvers<void>;
}

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
      let latestSearch: Search | null = null;

      function assertNotDisposed(): void {
        if (disposed) throw new EngineSessionDisposed();
      }

      function isSuperseded(search: Search): boolean {
        return latestSearch !== search;
      }

      function* closeWorker(): Operation<void> {
        const slot = workerSlot;
        workerSlot = IDLE;
        if (slot.status !== "idle") yield* slot.task.halt();
      }

      /**
       * Publishes the Worker from in here rather than handing it to the
       * search that asked: one cancelled mid-open would leave a live Worker
       * nobody recorded, and the next would open a second.
       */
      function* openWorker(
        ready: WithResolvers<Result<EngineEvaluator>>,
      ): Operation<void> {
        // An open halted before it succeeded or failed would otherwise
        // leave the waiting searches on a Worker nobody is opening.
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
          // Carried, not rethrown: raising here takes the session's scope
          // down too.
          ready.resolve(Err(error));
          return;
        }

        // Everything that takes the slot away halts this task first, so
        // `opening` is always this open.
        if (disposed || workerSlot.status !== "opening") return;
        workerSlot = { status: "ready", task: workerSlot.task, evaluator };
        ready.resolve(Ok(evaluator));
        yield* suspend();
      }

      /**
       * Re-openable while the session lives: a stop that went unanswered
       * leaves no Worker, and the next search opens one. Disposal is the
       * only thing this does not recover from.
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

      /** Returns only once the Worker is idle again, answered or killed,
       * which is what lets the next search speak. */
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

        // Infra leaves a halted session marked as searching, for its owner
        // to discard.
        yield* running.halt();
        yield* closeWorker();
      }

      function* releaseSearch(
        search: Search,
        previousSearch: Search | null,
      ): Operation<void> {
        if (search.searchTask) {
          yield* stopSearch(search);
          return;
        }
        // Holds nothing, but the next search waits on this link, so it
        // releases once its predecessor has.
        if (previousSearch) yield* previousSearch.released.operation;
        search.released.resolve();
      }

      /**
       * Runs in the session's scope, not the caller's, so a caller that
       * walks away cannot leave the engine mid-search with nobody to drain
       * it. The outcome travels as a value because a failing task raises on
       * the scope that owns it, tearing the session down.
       */
      function* executeSearch(
        evaluator: EngineEvaluator,
        search: Search,
        fen: string,
        onUpdate?: OnEngineUpdate,
      ): Operation<CompletedSearch> {
        if (isSuperseded(search)) throw new SearchSuperseded();

        const task = scope.run(function* (): Operation<Result<CompletedSearch>> {
          try {
            // The search runs to its own end, so a line it produces after
            // being replaced must not reach the caller.
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
          // Unwinding never enters a `catch`, so a raise is a halt: the
          // Worker was closed under the search, or the session went.
          throw disposed ? new EngineSessionDisposed() : new SearchSuperseded();
        }
        if (isSuperseded(search)) throw new SearchSuperseded();

        try {
          return unbox(settled);
        } catch (error) {
          // Infra already retried on a fresh session.
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
          // Unwinding halts whatever was running, an open in flight
          // included, and quits the engine before the Worker is terminated.
          yield* destroy();
        },
      };
    },
  };
}
