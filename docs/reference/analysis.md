# Analysis

Facts about the shipped analysis pipeline: engine configuration, classification
rules, and in-memory shapes. The reasoning behind these choices lives inline in
`libs/analysis`'s own doc comments (`winchance.ts`, `move-category.ts`,
`classify-move.ts`, `analyze-game.ts`) and this module's `tests/lichess-reference.test.ts`.
How the engine itself is driven — sessions, watchdog, retry — is
[the engine module](../explanation/modules/engine.md).

Analysis runs entirely in the browser. There is no server or worker leg and
no queue — the game itself arrives over HTTP through React Query, but the
analysis does not, because it is computed here. Progress lives in a store
outside React for the session, with per-position and whole-game caches in
IndexedDB underneath it.

Four modules split the work and none of them reaches into another's:
`libs/analysis` sequences a game's evaluations and classifies them,
reaching the engine only through the `PositionEvaluator` dependency it
declares; `@velachess/infra-engine` owns the UCI protocol, the session
lifetime, the search watchdog and recovery from a dead engine;
`apps/web/src/games/engine/` is the browser SDK over it — `createEngine()`
hands out sessions, each owning one Worker, reusing it between searches
and replacing a search in flight; and `apps/web/src/games/analysis/`
composes those, adds the cache and the white-POV conversion. Its two lanes
are its two sub-slices: `game/` grades a whole game, `position/` opens an
evaluator for single FENs.

Inside the analysis domain the jobs are split again, one owner each:
`analysis-store.ts` is a zustand store holding one game's snapshot, and
`game/start-analysis.ts` is the only thing that knows both the engine and
the store — it starts a pass, replaces it when another game is opened, and
refuses writes from a pass that was replaced. A ply is published by a
synchronous callback the whole way up: there is no stream, queue or async
generator between the engine and the screen.

## Engine configuration (production)

| Setting        | Value                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binary         | `stockfish` npm package's `stockfish-19-lite-single.js` (single-threaded WASM), copied to `apps/web/public/engine/` and run in a browser `Worker` |
| Depth          | **14** — `review/game-review-route.ts`'s own call into `startAnalysis`                                                                            |
| UCI options    | `Hash` only, fixed at 16 MB (`engine/browser-session.ts`'s `HASH_MB`). No Threads — the lite-single build is single-threaded                      |
| Search         | `go depth <N>` once per mainline position                                                                                                         |
| Watchdog       | `min(30000, max(5000, 3000 + depth·400))` ms of **silence**, rearmed by every `info` line (8600 ms at depth 14); on timeout `stop` + 2 s grace    |
| Failure policy | One retry per position on a fresh session; a second failure throws, and the session's Worker is dropped so the next search opens a clean one      |
| Stop deadline  | A stopped search has 2 s to answer `bestmove` (`engine.ts`'s `DEFAULT_STOP_SETTLE_MS`) before its Worker is killed; not rearmed by `info`         |
| Handshake      | A session fails after 10 s without `uciok`/`readyok`                                                                                              |

Analysis has one trigger: opening a game, and the route is what pulls it.
`review/game-review-route.ts` is the loader: it resolves the movetext
through the query cache, then starts the pass without awaiting it, so a
grading never holds a navigation open and no screen has to fire an effect
once it has already rendered. The call is wrapped in `createClientOnlyFn`,
because a loader runs on the server too and Stockfish is a Web Worker.
There is no explicit re-run
affordance, and reopening a game reads the cached report rather than
searching again.

Two Workers can run at once, one per session, and the sessions do not
coordinate: the whole-game pass is not interrupted by a variation someone
plays on the board, and neither waits for the other. That costs CPU and a
second 16 MB `Hash` while they overlap; the two searches are independent,
not faster. There is no scheduler, no priority and no shared lock —
`createEngine()` keeps no list of its sessions, so there is nothing that
could arbitrate between them.

Each session has an owner, and the owner's lifetime is the session's:

| Session               | Owner                                      | Disposed when                               |
| --------------------- | ------------------------------------------ | ------------------------------------------- |
| the whole-game pass   | `analysis/game/analyze-game-in-browser.ts` | the pass ends — finished, failed, or halted |
| interactive positions | `review/use-variation-evaluation.ts`       | the review unmounts                         |

Inside one session a newer search replaces the one in flight over UCI —
`go`, `stop`, `bestmove`, `position`, `go` — and the replaced search is
rejected with `SearchSuperseded` rather than returned, so a result cut
short by `stop` is never read as an answer and never cached at full depth.
The next search starts only once the engine has genuinely gone idle, which
is what keeps one Worker usable across hundreds of searches instead of one
Worker per FEN.

Cancelling is halting the task that started the work. That sends a real
`stop` and leaves the session reusable; it is disposal, not cancellation,
that terminates a Worker. Two things cancel, and they do not overlap:
opening a different game replaces the pass under way
(`game/start-analysis.ts`, whose halt also disposes that pass's session),
and the position a variation is showing stops being the one on screen
(`review/use-variation-evaluation.ts`, whose effect cleanup cancels the
search while keeping the session).

The whole-game pass is nobody's to cancel on close: closing the last open
game's screen, with nothing new to replace it, lets that run finish in the
background, and reopening it picks the same pass up rather than starting a
second. Leaving the review does dispose the interactive session, because
nothing reads it once the screen is gone.

## Classification

- Win chance: `2 / (1 + exp(K·cp)) − 1` with `K = -0.00368208`, cp ceiled to
  ±1000. A mate score maps to ±1000 cp (≈ ±0.951), not to ±1
  (`libs/analysis/winchance.ts`).
- Loss per move: `max(0, (winChance(before) − winChance(after)) · sign(mover))`
  on the [-1, 1] scale. Gaining eval is never punished.
- Categories (`MoveCategory`, `libs/analysis/move-category.ts`):
  `best | good | inaccuracy | mistake | blunder`. Thresholds on
  win-chance loss: **0.10** inaccuracy, **0.20** mistake, **0.30** blunder
  (5/10/15 percentage points of win probability) —
  `libs/analysis/classify-move.ts`.
- A move equal to the engine's first PV move is `best` regardless of loss; the
  raw `winChanceLoss` is still returned.
- Each `evalAfter` is reused as the next ply's `evalBefore` — one search per
  position total. A terminal final position (mate/stalemate) gets
  `{mate: ±1}` / `{cp: 0}` assigned directly, no search.

## Caching

Two IndexedDB stores, both LRU-pruned on write and both keyed on the engine
build so swapping the wasm binary invalidates what came before it
(`apps/web/src/games/analysis/analysis-cache.ts`):

| Store     | Key                                              | Holds                       |
| --------- | ------------------------------------------------ | --------------------------- |
| `rawEval` | fen + depth + multiPV + engineBuild              | one position's evaluation   |
| `report`  | gameId + policyVersion + depth + multiPV + build | a whole game's graded plies |

A cached report short-circuits before the engine is started at all.
Otherwise every position the game needs is read in one transaction up
front, and that pre-warmed map is what the evaluator checks per position —
a hit never reaches Stockfish. `POLICY_VERSION` is bumped when
`classify-move.ts` changes, which is what keeps a stale report from being
read back as current. Stored evaluations are white POV; the conversion from
the engine's side-to-move score happens once, in
`cached-position-evaluator.ts`.

## Entry points

- `libs/analysis/analyze-game.ts` → `analyzeGame`, `fensToEvaluate`,
  `PositionEvaluator`
- `libs/analysis/grade-game.ts` → `gradeGame`
- `libs/analysis/classify-move.ts` → `classifyMove`, `scoreToWinChance`
- `libs/analysis/move-category.ts` → `MoveCategory`
- `libs/infra/engine/engine-evaluator.ts` → `useEngineEvaluator`, and
  `EngineEvaluator.stop()` for whoever wants an in-flight search hurried
- `apps/web/src/games/engine/index.ts` → `browserEngine`, `ENGINE_BUILD`
- `apps/web/src/games/engine/` internals → `createEngine`,
  `EngineSessionHandle`, `SearchSuperseded`, `EngineSessionDisposed`,
  `openBrowserEngineSession`, `checkEngineCapability`
- `apps/web/src/games/analysis/index.ts` → `startAnalysis`,
  `useEngineAnalysis`, `openPositionEvaluator`, plus the graded-game read
  model (`gradeAtPly`, `summarize`, `evalCurve`, `whiteShareOf`,
  `progressPercent`, `bestMoveSan`, `sideOfPly`, `moveNumberOf`) and the
  `@velachess/analysis` vocabulary it re-exports
- `apps/web/src/games/analysis/` internals → `analysisStore`,
  `analyzeGameInBrowser`, `cachedPositionEvaluator`
- `apps/web/src/games/review/index.ts` → `loadGameReview`, the route
  loader that starts a game's analysis
- `apps/web/src/games/review/use-variation-evaluation.ts` → the one place
  a variation's position is searched, the one place that search is
  cancelled, and the owner of the session behind both
