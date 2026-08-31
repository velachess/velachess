# Analysis

Facts about the shipped analysis pipeline: engine configuration, classification
rules, and persisted shapes. The reasoning behind these choices lives inline in
`libs/analysis`'s own doc comments (`winchance.ts`, `engine-category.ts`,
`process-analysis/classify-move.ts`, `process-analysis/analyze-game.ts`) and
this module's `tests/lichess-reference.test.ts`.

## Engine configuration (production)

| Setting          | Value                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Binary           | `ENGINE_CMD` env var if set; otherwise `stockfish` npm `^18.0.8` (`stockfish-18-lite-single.js`, single-threaded WASM) run as a Node child process — `apps/worker/src/main.ts` |
| Depth            | **12** — `deps.depth ?? 12` in `process-analysis.ts`; the worker passes no depth, so `analyzeGame`'s own default of 14 is never used in production                             |
| UCI options      | None set. No Threads, no Hash, no MultiPV — `EngineSession.setOption` has no production caller. Only `multipv === 1` info lines are read                                       |
| Search           | `go depth <N>` once per mainline position                                                                                                                                      |
| Watchdog         | `min(30000, max(5000, 3000 + depth·400))` ms per search (7800 ms at depth 12); on timeout `stop` + 2 s grace                                                                   |
| Failure policy   | One whole-game retry on a fresh session; a second failure throws                                                                                                               |
| Handshake        | `EngineSession.init` fails after 10 s without `uciok`/`readyok`                                                                                                                |
| `engine_version` | Stored as the literal `"stockfish"` (`deps.engineVersion ?? "stockfish"`; nothing passes a value)                                                                              |

Analysis has one trigger: `POST /games/:id/analyze` enqueues (pg-boss); the
worker executes. Execution ownership is the session advisory lock
`analysis:${gameId}` (`libs/infra/db/advisory-lock.ts`), separate from queue
dedup. Drill triage runs after completion.

## Classification

- Win chance: `2 / (1 + exp(K·cp)) − 1` with `K = -0.00368208`, cp ceiled to
  ±1000. A mate score maps to ±1000 cp (≈ ±0.951), not to ±1
  (`libs/analysis/winchance.ts`).
- Loss per move: `max(0, (winChance(before) − winChance(after)) · sign(mover))`
  on the [-1, 1] scale. Gaining eval is never punished.
- Categories: `best | good | inaccuracy | mistake | blunder`. Thresholds on
  win-chance loss: **0.10** inaccuracy, **0.20** mistake, **0.30** blunder
  (5/10/15 percentage points of win probability) —
  `libs/analysis/process-analysis/classify-move.ts`.
- A move equal to the engine's first PV move is `best` regardless of loss; the
  raw `winChanceLoss` is still stored.
- `toEngineCategory` collapses `best`/`good` → `ok` for the `deviations`
  severity enum (`ok | inaccuracy | mistake | blunder`).
- `cpLoss` is mover-POV in centipawns; null when either eval is a mate score.
- Each `evalAfter` is reused as the next ply's `evalBefore` — one search per
  position total. A terminal final position (mate/stalemate) gets
  `{mate: ±1}` / `{cp: 0}` assigned directly, no search.

## Game phase heuristic

`gamePhaseOf(fen)` (`libs/insights/get-insights/phase.ts` — moved from
`libs/analysis` once `insights` became its only consumer): endgame at ≤ 6 majors+minors;
middlegame at ≤ 10, or when a back rank holds < 4 pieces; otherwise opening.
Only the placement field of the FEN is read. Consumers: insight sources only —
classification does not use phase.

## Persistence

- `game_analyses`: `game_id` (unique), `engine_version`, `depth`, `positions`
  jsonb of `StoredGradedPly[]`
  (`{ply, fen, san, evalBefore, evalAfter, bestMove, category, winChanceLoss}`).
  Row existence = analyzed. The row is the cache: an analyzed game is never
  re-analyzed, and **changing engine configuration does not invalidate or
  re-run existing reports** — old and new reports coexist, distinguishable
  only by their stored `depth`/`engine_version`.
- `analysis_progress`: per-ply streaming rows under a fresh `run_id` per
  attempt; unique `(run_id, index)`; deleted once the report lands. Readers
  follow the newest run only.
- `deviations.cp_loss` / `deviations.engine_category`: filled from the report
  via `engineSignalForDeviation` — at completion (same transaction as the
  report save), or at judge time when a cached report already exists.

## Entry points

- `libs/analysis/process-analysis/analyze-game.ts` → `analyzeGame`
- `libs/analysis/process-analysis/classify-move.ts` → `classifyMove`,
  `scoreToWinChance`
- `libs/analysis/engine-category.ts` → `toEngineCategory`, `cpLoss`
- `libs/analysis/process-analysis/process-analysis.ts` → `completeAnalysis`,
  `tryStartAnalysis`
- `apps/server/src/routes/games.ts` → `POST /:id/analyze`, `GET /:id/analysis`
- `apps/worker/src/consumers/analysis.ts` → `consumeAnalysisJob`

## Currently unused

`libs/analysis/accuracy.ts` (`moveAccuracy`, `gameAccuracy`) is a faithful
port of the reference implementation with a full test suite and no callers
in any app or slice.
