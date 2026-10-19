/**
 * One Worker, one search at a time, across two priority lanes:
 * `background` (the review screen's whole-game pass) and `interactive` (a
 * single ad-hoc FEN from a user exploring an alternate move). Interactive
 * always preempts background; background queues behind an interactive
 * call rather than interrupting it, and resumes once the engine is free.
 * A user waiting on the move they just tried should never queue behind a
 * whole game.
 *
 * All of the coordination is one claim (`holder`) plus one broadcast
 * (`released`). Cancelling is halting a task, and the handle that halts it
 * settles only once that task has finished unwinding — so the Worker is
 * gone before the next lane's search starts, with no handoff promise to
 * keep in sync. Which background pass is the current one is not decided
 * here: whoever started one halts it when it is replaced, and that halt
 * unwinds this manager's own bookkeeping with it.
 */
import type { PublishPly, RawEval } from "@velachess/analysis";
import {
  createChannel,
  ensure,
  Err,
  Ok,
  scoped,
  unbox,
  useScope,
  type Operation,
  type Result,
  type Task,
} from "../../libs/effection.ts";

import {
  analyzeGameInBrowser,
  type GameAnalysisInput,
} from "./game/analyze-game-in-browser.ts";
import { evaluatePositionInBrowser, type PositionInput } from "./position/index.ts";

type Priority = "background" | "interactive";

type Attempt<T> = { completed: true; value: T } | { completed: false };

interface Holder {
  readonly priority: Priority;
  /** Halts the body and settles once it has finished unwinding. */
  preempt(): Operation<void>;
}

/** A newer interactive evaluation took the engine before this one
 * finished. Not a failure: there is simply nothing to show for it. */
export class EnginePreempted extends Error {
  constructor() {
    super("A newer interactive evaluation superseded this one");
    this.name = "EnginePreempted";
  }
}

export interface EngineManager {
  /** Grades the whole game, publishing each ply as it lands. Resumes by
   * itself after an interactive evaluation takes the engine. */
  analyzeGame(input: GameAnalysisInput, publish: PublishPly): Operation<void>;
  evaluatePosition(input: PositionInput): Operation<RawEval>;
}

export function createEngineManager(): EngineManager {
  /** The request that owns the engine right now, if any. */
  let holder: Holder | null = null;
  const released = createChannel<void, never>();

  function* release(candidate: Holder): Operation<void> {
    if (holder === candidate) holder = null;
    yield* released.send();
  }

  /**
   * Claims the engine, preempting a background holder for an interactive
   * request and waiting otherwise. The test and the claim share one
   * synchronous step: with a suspension between them, two requests could
   * both find the engine free.
   *
   * ponytail: not FIFO among equals — whoever the scheduler resumes first
   * wins. With two lanes and at most a couple of requests in flight that
   * is unobservable; a fair queue goes here if it ever stops being.
   */
  function* acquire(candidate: Holder): Operation<void> {
    const releases = yield* released;

    while (true) {
      if (!holder) {
        holder = candidate;
        return;
      }
      // Interactive preempts anything; background waits. Reading the
      // whole precedence policy off one condition is the point — there is
      // no second place where a lane's rank is decided.
      if (candidate.priority === "interactive") yield* holder.preempt();
      // Waiting for the release broadcast rather than re-testing straight
      // away: a preempted body is still unwinding when `preempt` settles,
      // and its own `ensure` is what clears the claim. The subscription
      // was opened above, so a release that already fired is buffered.
      yield* releases.next();
    }
  }

  /**
   * Runs `body` as the sole holder of the engine. Preempting is halting
   * the task that runs it, and `scope.run` is synchronous — so the handle
   * to halt is in place in the very same step as the claim, before any
   * other request can observe this holder.
   */
  function withEngine<T>(
    priority: Priority,
    body: () => Operation<T>,
  ): Operation<Attempt<T>> {
    return scoped(function* (): Operation<Attempt<T>> {
      const scope = yield* useScope();
      let running: Task<Result<T>> | null = null;

      const candidate: Holder = {
        priority,
        *preempt(): Operation<void> {
          if (running) yield* running.halt();
        },
      };

      // Registered before the claim, so a halt anywhere inside `acquire`
      // still releases: `release` checks whether this holder ever
      // actually held the engine.
      yield* ensure(() => release(candidate));
      yield* acquire(candidate);

      // Nothing suspends between `acquire` installing the claim and this
      // assignment, so a preemptor always finds a task to halt.
      running = scope.run(function* (): Operation<Result<T>> {
        // An error is carried out as a value rather than thrown: a task
        // that fails raises on its owner scope, which would take the
        // manager down before the caller could be told.
        try {
          return Ok(yield* body());
        } catch (error) {
          return Err(error);
        }
      });

      let settled: Result<T>;
      try {
        settled = yield* running;
      } catch {
        // Unwinding never enters a `catch`, so the only thing that lands
        // here is a deliberate halt — this request was preempted.
        return { completed: false };
      }
      return { completed: true, value: unbox(settled) };
    });
  }

  return {
    /**
     * Retries the whole pass until it finishes, rather than dying the
     * first time an interactive evaluation takes the engine. A resumed
     * pass starts the game over but skips what the caller already has,
     * and every FEN it re-walks is a cache hit, so no search is repeated
     * — only the handshake of a fresh session is paid again.
     */
    *analyzeGame(input: GameAnalysisInput, publish: PublishPly): Operation<void> {
      let delivered = 0;

      while (true) {
        const attempt = yield* withEngine("background", function* () {
          let seen = 0;
          yield* analyzeGameInBrowser(input, (position) => {
            seen++;
            if (seen > delivered) {
              delivered = seen;
              publish(position);
            }
          });
        });

        if (attempt.completed) return;
      }
    },

    *evaluatePosition(input: PositionInput): Operation<RawEval> {
      const attempt = yield* withEngine("interactive", () =>
        evaluatePositionInBrowser(input),
      );
      if (!attempt.completed) throw new EnginePreempted();
      return attempt.value;
    },
  };
}

export const engineManager = createEngineManager();
