# Agent Guide — `libs/analysis`

Extends `../../AGENTS.md`. Owns the pure Stockfish analysis algorithm
(`analyzeGame`, the per-ply search/classify loop) and the policies a
result is read through (`score.ts`, `winchance.ts`, `classify-move.ts`,
`move-category.ts`). No persistence, no queue, no HTTP route — analysis
runs entirely in `apps/web/src/games/browser-analysis/` (Stockfish WASM
in a Web Worker), and a browser-computed result lives only in that
session's React Query cache. There is no server/worker analysis path.

`analyzeGame` is also split into its two halves, `evaluatePositions`
(I/O, through `EngineSession` alone — never a Worker or `postMessage`
directly) and `gradeGame` (pure, no I/O). `fensToEvaluate` produces the
FEN list `evaluatePositions`'s output must align with for `gradeGame` to
read back correctly.
`RetryingEvaluator`/`classifyPly`/`terminalScoreOf` are private to this
file and shared by both `analyzeGame` and the split pair — the
fresh-session-retry policy and the per-ply classification each exist
once.

`AnalyzeOptions.cache` is a narrow `RawEvalCache` dependency
(`get`/`put` by FEN) a caller may supply so a position already seen
under the same search parameters never reaches the engine twice.
Checked and populated inline, per position, inside
`RetryingEvaluator.evaluate` — this module has no IndexedDB dependency,
no `gameId`, and no batching of its own; a caller that wants one
IndexedDB round trip for a whole game's worth of positions (rather than
one per position) pre-warms its own `RawEvalCache.get` from a batch
read before calling in, which is exactly what
`apps/web/src/games/browser-analysis/analyze-game-in-browser.ts` does.
`POLICY_VERSION` (`policy-version.ts`) is this module's other half of a
cache key: bumped when `classify-move.ts` changes, read only by
external cache callers, never by this module itself.

`index.ts` exports: `analyzeGame`, `evaluatePositions`, `fensToEvaluate`,
`gradeGame`, `scoreToWinChance`, `MOVE_CATEGORIES`, `POLICY_VERSION`;
types `AnalysisEvent`, `AnalyzeOptions`, `GradedPly`, `RawEval`,
`RawEvalCache`, `MoveCategory`, `WhitePovScore`.

Cross-module dependencies: depends on `@velachess/chess`. Everything a
caller supplies (an engine session, a transport) arrives through declared
dependency types — nothing in this module constructs one itself.

Depended on by `apps/web` (reached directly through this module's
`index.ts` — no composition, since the frontend has no composition root
of its own).
