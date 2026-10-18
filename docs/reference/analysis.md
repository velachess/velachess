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

Three modules split the work and none of them reaches into another's:
`libs/analysis` sequences a game's evaluations and classifies them,
reaching the engine only through the `PositionEvaluator` dependency it
declares; `@velachess/infra-engine` owns the UCI protocol, the session
lifetime, the search watchdog and recovery from a dead engine;
`apps/web/src/games/browser-analysis/` composes the two, adds the cache,
and schedules who gets the one Worker.

Inside that slice the three jobs are split again, one owner each:
`engine-manager.ts` decides who gets the engine, `analysis-store.ts`
stores snapshots and notifies React, and `start-analysis.ts` is the only
thing that knows both — it starts a pass, replaces it when another game is
opened, and refuses writes from a pass that was replaced. A ply is
published by a synchronous callback the whole way up: there is no stream,
queue or async generator between the engine and the screen.

## Engine configuration (production)

| Setting        | Value                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binary         | `stockfish` npm package's `stockfish-19-lite-single.js` (single-threaded WASM), copied to `apps/web/public/engine/` and run in a browser `Worker` |
| Depth          | **14** — `useBrowserAnalysis`'s own call into `analyzeGameInBrowser`                                                                              |
| UCI options    | `Hash` only, fixed at 16 MB (`open-browser-engine-session.ts`'s `DEFAULT_HASH_MB`). No Threads — the lite-single build is single-threaded         |
| Search         | `go depth <N>` once per mainline position                                                                                                         |
| Watchdog       | `min(30000, max(5000, 3000 + depth·400))` ms of **silence**, rearmed by every `info` line (8600 ms at depth 14); on timeout `stop` + 2 s grace    |
| Failure policy | One retry per position on a fresh session; a second failure throws                                                                                |
| Handshake      | A session fails after 10 s without `uciok`/`readyok`                                                                                              |

Analysis has one trigger: opening a game. There is no explicit re-run
affordance, and reopening a game reads the cached report rather than
searching again.

One Worker runs at a time, across two priority lanes. `interactive` (one
ad-hoc FEN, from a user trying an alternate move on the board) always
preempts `background` (the whole-game pass); `background` never interrupts
`interactive`, and a newer request supersedes the older one in its own
lane. A preempted whole-game pass **resumes** once the engine is free: it
replays the game, which is engine-free because those positions are already
cached, and skips the plies the screen already has, so nothing is delivered
twice.

Cancelling is halting the task that started the work, which unwinds the
engine session and terminates the Worker — and the handle that halts it
settles only once that teardown has finished, so the next lane never
starts against a Worker that is still going away. Exactly two things
cancel, and neither overlaps the other: an interactive evaluation
preempts the background lane (`engine-manager.ts`), and opening a
different game replaces the pass under way (`start-analysis.ts`). There
is still no cancel-on-close: closing the last open game's screen, with
nothing new to replace it, lets that run finish in the background, and
reopening it picks the same pass up rather than starting a second.

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
(`apps/web/src/games/browser-analysis/analysis-cache.ts`):

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
- `libs/infra/engine/engine-evaluator.ts` → `useEngineEvaluator`
- `apps/web/src/games/browser-analysis/` → `useBrowserAnalysis`,
  `startAnalysis`, `analysisStore`, `useEngineAnalysis`, `engineManager`,
  `analyzeGameInBrowser`, `evaluatePositionInBrowser`,
  `openBrowserEngineSession`, `cachedPositionEvaluator`
