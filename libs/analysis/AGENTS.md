# Agent Guide — `libs/analysis`

Extends `../../AGENTS.md`. Owns the Stockfish job lifecycle end to end:
request (queue or report), process (execute under the advisory lock,
persist), watch (poll progress), get (the composed read a game page
renders).

`index.ts` exports: `getAnalysisReport`, `requestAnalysis`,
`requestAnalysisForUser`, `startAnalysisForUser`, `createWatchers`,
`completeAnalysis`, `scoreToWinChance`; types `AnalysisReport`,
`GetAnalysisDeps`, `AnalysisRequest`, `GameAnalysisRecord`,
`RequestAnalysisDeps`, `WatcherDeps`, `Watchers`, `WatchSnapshot`,
`WatchTerminal`, `AnalyzeDeps`, `GradedPly`. `tryStartAnalysis` (the TOCTOU/streaming primitive
`completeAnalysis` wraps) stays private — its own contract is tested at
`libs/analysis/tests/execution.test.ts`, not exposed for outside use.

Cross-module dependencies: depends on `@velachess/chess`. Everything else
(database, queue, engine session, advisory lock) arrives through declared
dependency types.

Depended on by `apps/web` (`scoreToWinChance`, reached directly through this
module's `index.ts` — no composition, since the frontend has no composition
root of its own).
