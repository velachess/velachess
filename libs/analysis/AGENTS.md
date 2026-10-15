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
read back correctly. The split exists so a caller that wants to cache
raw evaluations (`apps/web/src/games/browser-analysis/`) can do so
between the I/O and the classification, without analyzeGame's own
streaming loop needing to know about a cache at all.
`RetryingEvaluator`/`classifyPly`/`terminalScoreOf` are private to this
file and shared by both `analyzeGame` and the split pair — the
fresh-session-retry policy and the per-ply classification each exist
once.

`index.ts` exports: `analyzeGame`, `evaluatePositions`, `fensToEvaluate`,
`gradeGame`, `scoreToWinChance`, `MOVE_CATEGORIES`; types
`AnalysisEvent`, `AnalyzeOptions`, `GradedPly`, `RawEval`,
`MoveCategory`, `WhitePovScore`.

Cross-module dependencies: depends on `@velachess/chess`. Everything a
caller supplies (an engine session, a transport) arrives through declared
dependency types — nothing in this module constructs one itself.

Depended on by `apps/web` (reached directly through this module's
`index.ts` — no composition, since the frontend has no composition root
of its own).
