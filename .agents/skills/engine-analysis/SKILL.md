---
name: engine-analysis
description: Change or review VelaChess Stockfish execution, engine sessions, UCI scores, mate and centipawn normalization, side-to-move perspective, or per-ply classification. Use for libs/infra/engine, libs/analysis, or apps/web's browser-side analysis runner.
---

# Work on engine analysis

Keep three concerns separate, and do not let one reach into another:

- `libs/infra/engine` owns UCI transport, session lifetime, and evaluation
  reliability — the silence watchdog, the grace period, and retrying on a
  fresh session (`engine-evaluator.ts`). Transports are
  `useChildProcessTransport` (no production caller, retained for tests and
  local use) and `useWorkerTransport` (the browser). It returns the
  engine's own vocabulary and never imports a business module.
- `libs/analysis` owns which positions to evaluate, what the answers mean,
  and nothing about how the engine is driven. The engine reaches it only
  through the `PositionEvaluator` dependency it declares, so this module
  depends on neither `@velachess/infra-engine` nor a cache.
- `apps/web/src/games/browser-analysis/` composes the two, owns the
  IndexedDB caches and the side-to-move → white-POV conversion, and
  schedules which lane gets the one Worker (`engine-manager.ts`). Inside
  it, `analysis-store.ts` only stores snapshots and notifies React —
  it imports neither Effection nor the manager — and `start-analysis.ts`
  is the one module that knows both. Keep it that way: a ply travels up
  by synchronous callback, and the two cancellations (interactive
  preempting background; a new game replacing the pass under way) have
  one owner each.

Asynchronous lifecycle is Effection. A session is a resource, so leaving
the scope that opened it quits the engine and terminates the Worker;
cancelling is halting the task that started the work, and the handle that
halts it settles only once teardown has finished. Do not add an
`AbortController`, a settled-promise handoff, an epoch counter, or a second
queue beside it — and keep Promises and native events at the external
boundaries that genuinely need them (React Query's `streamFn`, a Worker's
`message` event).

Prefer Stockfish/UCI and Effection primitives over local schedulers,
polling, timeouts, or retry frameworks. Keep classification pure and
reproducible from its explicit inputs.

Trace score point of view explicitly across UCI, normalization,
classification, and presentation. Preserve mate as a distinct score shape.
Do not make import or refresh an engine trigger — the only trigger is
opening a game, client-side.

Canonical detail lives in `docs/reference/analysis.md` and the live
code/tests. Verify those owners before changing an option, threshold, or
watchdog.
