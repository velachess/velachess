# Analysis

Facts about the shipped analysis pipeline: engine configuration, classification
rules, and in-memory shapes. The reasoning behind these choices lives inline in
`libs/analysis`'s own doc comments (`winchance.ts`, `move-category.ts`,
`classify-move.ts`, `analyze-game.ts`) and this module's `tests/lichess-reference.test.ts`.

Analysis runs entirely in the browser. There is no server or worker leg, no
queue, and no persisted report — a result lives only in that tab's React
Query cache for the session. `libs/analysis` holds only the pure
algorithm and policies; `apps/web/src/games/browser-analysis/` runs it.

## Engine configuration (production)

| Setting        | Value                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Binary         | `stockfish` npm package's `stockfish-19-lite-single.js` (single-threaded WASM), copied to `apps/web/public/engine/` and run in a browser `Worker` |
| Depth          | **14** — `useBrowserAnalysis`'s own call into `analyzeGameInBrowser`                                                                              |
| UCI options    | `Hash` only, fixed at 16 MB (`create-browser-engine-session.ts`'s `DEFAULT_HASH_MB`). No Threads — the lite-single build is single-threaded       |
| Search         | `go depth <N>` once per mainline position                                                                                                         |
| Watchdog       | `min(30000, max(5000, 3000 + depth·400))` ms per search (8600 ms at depth 14); on timeout `stop` + 2 s grace                                      |
| Failure policy | One whole-game retry on a fresh session; a second failure throws                                                                                  |
| Handshake      | `EngineSession.init` fails after 10 s without `uciok`/`readyok`                                                                                   |

Analysis has one trigger: opening a game. There is no explicit re-run
affordance and no caching across sessions — reopening a game re-analyzes it.
Cancellation is advisory only (`AbortSignal`, same convention
`analysis-contract.ts` uses for `runAnalysis`); an in-flight run is not
stopped when the screen is left early, it finishes in the background.

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

## Entry points

- `libs/analysis/process-analysis/analyze-game.ts` → `analyzeGame`
- `libs/analysis/classify-move.ts` → `classifyMove`, `scoreToWinChance`
- `libs/analysis/move-category.ts` → `MoveCategory`
- `apps/web/src/games/browser-analysis/` → `analyzeGameInBrowser`,
  `useBrowserAnalysis`, `createBrowserEngineSession`

## Currently unused

`libs/analysis/accuracy.ts` (`moveAccuracy`, `gameAccuracy`) is a faithful
port of the reference implementation with a full test suite and no callers
in any app or slice.
