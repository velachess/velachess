---
name: engine-analysis
description: Change or review VelaChess Stockfish execution, engine sessions, UCI scores, mate and centipawn normalization, side-to-move perspective, or per-ply classification. Use for libs/infra/engine, libs/analysis, or apps/web's browser-side analysis runner.
---

# Work on engine analysis

Keep four concerns separate, and do not let one reach into another:

- `libs/infra/engine` owns UCI transport, session lifetime, and evaluation
  reliability — the silence watchdog, the grace period, and retrying on a
  fresh session (`engine-evaluator.ts`). Transports are
  `useChildProcessTransport` (no production caller, retained for tests and
  local use) and `useWorkerTransport` (the browser). It returns the
  engine's own vocabulary and never imports a business module.
- `libs/analysis` owns which positions to evaluate, what the answers mean,
  and nothing about how the engine is driven. The engine reaches it only
  through the `PositionEvaluator` dependency it declares, so this module
  depends on neither `@velachess/infra-engine` nor any storage.
- `apps/web/src/engine/` is the browser SDK: `createEngine()` hands
  out sessions, each owning one Stockfish Worker, creating it lazily,
  reusing it between searches, replacing a search in flight over UCI
  (`go`, `stop`, `bestmove`, `position`, `go`) and killing the Worker when
  a stop goes unanswered. It returns `CompletedSearch` and knows nothing
  about games, plies or scores. Sessions never see each other: there is no
  registry, lane, priority or shared lock, and `createEngine` keeps no
  list of what it created. Do not add one — two Workers running at once is
  the design, not a problem to schedule away.
- `apps/web/src/games/analysis/` composes the rest, owns the one IndexedDB
  store and the side-to-move → white-POV conversion. Its two lanes are two
  flat files: `analyze-game-in-browser.ts` grades a whole game on a session
  it owns for the length of the pass, `evaluate-position-in-browser.ts`
  opens a disposable evaluator for single FENs whose owner is
  `review/use-variation-evaluation.ts`. `analysis-db.ts` holds one finished
  report per game and nothing else — no per-position cache, so an
  interrupted pass starts over and a variation is never persisted. Inside
  the domain, `analysis-store.ts` only stores snapshots and notifies React
  — it imports no Effection — and `start-analysis.ts` is the one module
  that knows both engine and store. Keep it that way: a ply travels up by
  synchronous callback, and the two cancellations (a new game replacing the
  pass under way; the variation's position changing) have one owner each.
- The domain's `index.ts` is what the review screen sees: `startAnalysis`,
  `useEngineAnalysis`, `openPositionEvaluator` and the `@velachess/analysis`
  vocabulary it re-exports. It hands over `GradedPly[]` and nothing else —
  reading that result is Review's. Analysis never imports `review/`.

Asynchronous lifecycle is Effection. Infra's session is a resource, so
leaving the scope that opened it quits the engine and terminates the
Worker — which is why the SDK holds its Worker in a scope of its own,
outliving any one caller, and why an SDK session's `dispose()` is final
rather than something a cancelled caller triggers. Cancelling is halting
the task that started the work: it sends a real `stop`, drains the search,
and leaves the session reusable. Do not add an `AbortController`, a
settled-promise handoff, an epoch counter, or a second queue beside it —
and keep Promises and native events at the external boundaries that
genuinely need them (React Query's `streamFn`, a Worker's `message`
event).

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
